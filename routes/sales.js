const express = require("express");
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const { recordSale, PAYMENT_METHODS } = require("../utils/salesService");
const stock = require("../utils/stock");
const { defaultLocation } = require("../utils/locationHelpers");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery, parseRangeBound } = require("../utils/dates");
const { HttpError, validateIdParam, requireNumber, computeStatus, isId } = require("../utils/helpers");
const { resolveLocation } = require("../utils/locationHelpers");
const { planReturn } = require("../utils/returns");
const money = (n) => "₦" + Number(n).toLocaleString("en-NG");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

router.use(requireAdmin); // internal business data only

// What the customer still keeps after returns/refunds (used in atomic updates).
const NET_TOTAL = { $subtract: ["$totalAmount", { $ifNull: ["$returnedAmount", 0] }] };
const NET_PAID = { $subtract: ["$amountPaid", { $ifNull: ["$refundedAmount", 0] }] };
// Recomputes Paid / Partial / Unpaid from the NET numbers, inside the same update.
const STATUS_STAGE = {
  $set: {
    paymentStatus: {
      $cond: [
        { $gte: [NET_PAID, { $subtract: [NET_TOTAL, 0.005] }] }, "Paid",
        { $cond: [{ $gt: [NET_PAID, 0.005] }, "Partial", "Unpaid"] },
      ],
    },
  },
};
const netOwed = (s) => s.totalAmount - (s.returnedAmount || 0) - (s.amountPaid - (s.refundedAmount || 0));

async function refreshProductStatus(productId) {
  const doc = await Product.findById(productId);
  if (doc) {
    const status = computeStatus(doc);
    if (status !== doc.status) { doc.status = status; await doc.save(); }
  }
}

// POST /api/sales/:id/returns — a customer brings goods back.
// Body: { quantity, amount?, refund?, restock?, location?, reason?, note?, refundMethod?, date? }
//   quantity — units coming back (can't exceed what is still with the customer)
//   amount   — value credited for them (default quantity × unit price)
//   refund   — money handed back now (default: whatever the customer has overpaid; 0 = keep as balance)
//   restock  — put the goods back on the shelf (default true); false for damaged goods
//   location — where they go back to (default: where they were sold from)
router.post("/:id/returns", async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });

  const { quantity, amount, refund } = planReturn(sale, req.body);

  const refundMethod = req.body.refundMethod === undefined ? "Cash" : req.body.refundMethod;
  if (!PAYMENT_METHODS.includes(refundMethod)) throw new HttpError(400, "Invalid refund method");
  const restock = req.body.restock === undefined ? true : req.body.restock === true || req.body.restock === "true";
  let date = new Date();
  if (req.body.date) {
    date = parseRangeBound(req.body.date, "from");
    if (!date) throw new HttpError(400, "Invalid date");
  }
  const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

  const fallback = await defaultLocation("selling");
  const loc = restock ? await resolveLocation(req.body.location || sale.location || undefined, "selling") : null;
  const entry = {
    _id: new mongoose.Types.ObjectId(), quantity, amount, refund, refundMethod, restocked: restock,
    location: loc ? loc._id : undefined, locationName: loc ? loc.name : "",
    reason: text(req.body.reason, 200), note: text(req.body.note, 300), date, recordedBy: new mongoose.Types.ObjectId(req.admin.id),
  };

  // One atomic step. The filter re-checks every limit against the CURRENT numbers,
  // so two people returning the same sale at the same moment can't return more
  // than was sold or refund more than was paid.
  const claimed = await Sale.findOneAndUpdate(
    {
      _id: sale._id,
      $expr: {
        $and: [
          { $lte: [{ $add: [{ $ifNull: ["$returnedQuantity", 0] }, quantity] }, { $add: ["$quantity", 0.00005] }] },
          { $lte: [{ $add: [{ $ifNull: ["$returnedAmount", 0] }, amount] }, { $add: ["$totalAmount", 0.005] }] },
          { $lte: [refund, { $add: [{ $subtract: [NET_PAID, { $subtract: [NET_TOTAL, amount] }] }, 0.005] }] },
        ],
      },
    },
    [
      {
        $set: {
          returnedQuantity: { $add: [{ $ifNull: ["$returnedQuantity", 0] }, quantity] },
          returnedAmount: { $add: [{ $ifNull: ["$returnedAmount", 0] }, amount] },
          refundedAmount: { $add: [{ $ifNull: ["$refundedAmount", 0] }, refund] },
          returns: { $concatArrays: [{ $ifNull: ["$returns", []] }, [{ $literal: entry }]] }, // $literal keeps text like "$5" as text
        },
      },
      STATUS_STAGE,
    ],
    { new: true }
  );
  if (!claimed) throw new HttpError(409, "This sale was just changed by someone else. Reload and try again.");

  if (restock) {
    try {
      await stock.put(Product, sale.product, loc._id, quantity, fallback && fallback._id);
    } catch (err) {
      // Couldn't put the goods back — undo the return so nothing is half-done.
      await Sale.updateOne({ _id: sale._id }, [
        { $set: { returnedQuantity: { $max: [0, { $subtract: ["$returnedQuantity", quantity] }] }, returnedAmount: { $max: [0, { $subtract: ["$returnedAmount", amount] }] }, refundedAmount: { $max: [0, { $subtract: ["$refundedAmount", refund] }] }, returns: { $filter: { input: "$returns", cond: { $ne: ["$$this._id", entry._id] } } } } },
        STATUS_STAGE,
      ]);
      throw err;
    }
    await refreshProductStatus(sale.product);
  }

  audit(req, "sale.return", `Return: ${quantity} × ${sale.productName}${sale.customerName ? " from " + sale.customerName : ""}, credit ${money(amount)}${refund ? ", refunded " + money(refund) : ""}${restock ? " — back in " + loc.name : " — not restocked"}`);
  const out = claimed.toObject();
  if (!req.admin.isOwner) delete out.costPriceAtSale;
  res.status(201).json(out);
});

// DELETE /api/sales/:id/returns/:returnId — admin only: undo a wrongly recorded return.
// The goods are taken back off the shelf (only possible while they are still there).
router.delete("/:id/returns/:returnId", requireOwner, async (req, res) => {
  if (!isId(req.params.returnId)) throw new HttpError(400, "Invalid return");
  const sale = await Sale.findOne({ _id: req.params.id, "returns._id": req.params.returnId });
  if (!sale) return res.status(404).json({ error: "Return not found" });
  const r = sale.returns.id(req.params.returnId);
  const fallback = await defaultLocation("selling");

  if (r.restocked && r.location) {
    const took = await stock.take(Product, sale.product, r.location, r.quantity, fallback && fallback._id);
    if (!took) throw new HttpError(400, `Those ${r.quantity} units are no longer at ${r.locationName || "that location"} (they were sold or moved), so this return can't be undone.`);
  }
  const undone = await Sale.findOneAndUpdate(
    { _id: sale._id, "returns._id": r._id },
    [
      { $set: { returnedQuantity: { $max: [0, { $subtract: ["$returnedQuantity", r.quantity] }] }, returnedAmount: { $max: [0, { $subtract: ["$returnedAmount", r.amount] }] }, refundedAmount: { $max: [0, { $subtract: ["$refundedAmount", r.refund] }] }, returns: { $filter: { input: "$returns", cond: { $ne: ["$$this._id", r._id] } } } } },
      STATUS_STAGE,
    ],
    { new: true }
  );
  if (!undone) {
    if (r.restocked && r.location) await stock.put(Product, sale.product, r.location, r.quantity, fallback && fallback._id); // someone else undid it first
    return res.status(404).json({ error: "Return not found" });
  }
  await refreshProductStatus(sale.product);
  audit(req, "sale.return.delete", `Undid a return of ${r.quantity} × ${sale.productName}`);
  res.json(undone);
});

// GET /api/sales — optionally ?from=&to=
router.get("/", async (req, res) => {
  const sales = await Sale.find(dateFilterFromQuery(req.query))
    .select(req.admin.isOwner ? "" : "-costPriceAtSale") // profit margins are owner-only
    .populate({ path: "product", select: "name ref category", populate: { path: "category", select: "name" } })
    .sort({ date: -1 });
  res.json(sales);
});

// POST /api/sales — records a sale and decreases the product's quantity.
// Optionally pass fromQuote: <quoteId> to link it and mark that quote Closed.
router.post("/", async (req, res) => {
  const { sale } = await recordSale(req.body, req.admin.id);
  audit(req, "sale.create", `Sale: ${sale.quantity} × ${sale.productName} for ₦${sale.totalAmount.toLocaleString("en-NG")}${sale.customerName ? " to " + sale.customerName : ""} (${sale.paymentStatus})`);
  const saleOut = sale.toObject();
  if (!req.admin.isOwner) delete saleOut.costPriceAtSale;
  res.status(201).json(saleOut);
});

// POST /api/sales/:id/payments — a customer pays off (part of) a balance later.
// Body: { amount, method?, date?, note? }. Can never take the sale past fully paid.
router.post("/:id/payments", async (req, res) => {
  const amount = Math.round(requireNumber(req.body.amount, "amount", { min: 0, exclusiveMin: true }) * 100) / 100;
  const method = req.body.method === undefined ? "Cash" : req.body.method;
  if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, "Invalid payment method");
  let date = new Date();
  if (req.body.date) {
    date = parseRangeBound(req.body.date, "from");
    if (!date) throw new HttpError(400, "Invalid date");
  }
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";
  const payment = { _id: new mongoose.Types.ObjectId(), amount, method, date, note, recordedBy: new mongoose.Types.ObjectId(req.admin.id) };

  // One atomic step: the filter only matches while the new total still fits, so
  // two people recording the same payment at once can't overpay the sale.
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, $expr: { $lte: [{ $add: [NET_PAID, amount] }, { $add: [NET_TOTAL, 0.005] }] } },
    [
      { $set: { amountPaid: { $add: ["$amountPaid", amount] }, payments: { $concatArrays: [{ $ifNull: ["$payments", []] }, [{ $literal: payment }]] } /* $literal: a note like "$100" must stay text, not become a field reference */ } },
      STATUS_STAGE,
    ],
    { new: true }
  );
  if (!sale) {
    const existing = await Sale.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Sale not found" });
    const owed = Math.max(0, netOwed(existing));
    throw new HttpError(400, owed <= 0 ? "This sale is already fully paid." : `That's more than is owed — the balance is ₦${owed.toLocaleString("en-NG")}.`);
  }
  audit(req, "sale.payment", `Payment of ₦${amount.toLocaleString("en-NG")} on ${sale.productName}${sale.customerName ? " (" + sale.customerName + ")" : ""}`);
  const out = sale.toObject();
  if (!req.admin.isOwner) delete out.costPriceAtSale;
  res.status(201).json(out);
});

// DELETE /api/sales/:id/payments/:paymentId — owner only: undo a wrongly recorded payment
router.delete("/:id/payments/:paymentId", requireOwner, async (req, res) => {
  if (!isId(req.params.paymentId)) throw new HttpError(400, "Invalid payment");
  const existing = await Sale.findOne({ _id: req.params.id, "payments._id": req.params.paymentId });
  if (!existing) return res.status(404).json({ error: "Payment not found" });
  const payment = existing.payments.id(req.params.paymentId);
  if (existing.amountPaid - payment.amount < (existing.refundedAmount || 0) - 0.005) {
    return res.status(400).json({ error: "This payment has already been partly refunded through a return. Undo the return first." });
  }
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, "payments._id": req.params.paymentId },
    [
      { $set: { amountPaid: { $max: [0, { $subtract: ["$amountPaid", payment.amount] }] }, payments: { $filter: { input: "$payments", cond: { $ne: ["$$this._id", payment._id] } } } } },
      STATUS_STAGE,
    ],
    { new: true }
  );
  audit(req, "sale.payment.delete", `Removed a payment of ₦${payment.amount.toLocaleString("en-NG")} on ${existing.productName}`);
  res.json(sale);
});

// DELETE /api/sales/:id — reverses the stock decrease before deleting
router.delete("/:id", requireOwner, async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });

  // Put the goods back where they were taken from (old sales with no recorded
  // location go back to the shop).
  const fallback = await defaultLocation("selling");
  const back = sale.location || (fallback && fallback._id);
  // Units already returned were put back when they were returned — only the rest goes back now.
  const stillOut = Math.round((sale.quantity - (sale.returnedQuantity || 0)) * 10000) / 10000;
  if (back && stillOut > 0) await stock.put(Product, sale.product, back, stillOut, fallback && fallback._id);
  const productDoc = await Product.findById(sale.product);
  if (productDoc) {
    const newStatus = computeStatus(productDoc);
    if (newStatus !== productDoc.status) {
      productDoc.status = newStatus;
      await productDoc.save();
    }
  }

  await sale.deleteOne();
  audit(req, "sale.delete", `Deleted sale: ${sale.quantity} × ${sale.productName} (₦${Number(sale.totalAmount).toLocaleString("en-NG")})${sale.customerName ? " to " + sale.customerName : ""}`);
  res.json({ message: "Sale deleted and stock restored" });
});

module.exports = router;
