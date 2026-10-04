const express = require("express");
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const { recordSale, PAYMENT_METHODS } = require("../utils/salesService");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery, parseRangeBound } = require("../utils/dates");
const { HttpError, validateIdParam, requireNumber, computeStatus, isId } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

router.use(requireAdmin); // internal business data only

// GET /api/sales — optionally ?from=&to=
router.get("/", async (req, res) => {
  const sales = await Sale.find(dateFilterFromQuery(req.query))
    .select(req.admin.role === "owner" ? "" : "-costPriceAtSale") // profit margins are owner-only
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
  if (req.admin.role !== "owner") delete saleOut.costPriceAtSale;
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
    { _id: req.params.id, $expr: { $lte: [{ $add: ["$amountPaid", amount] }, { $add: ["$totalAmount", 0.005] }] } },
    [
      { $set: { amountPaid: { $add: ["$amountPaid", amount] }, payments: { $concatArrays: [{ $ifNull: ["$payments", []] }, [{ $literal: payment }]] } /* $literal: a note like "$100" must stay text, not become a field reference */ } },
      { $set: { paymentStatus: { $cond: [{ $gte: ["$amountPaid", { $subtract: ["$totalAmount", 0.005] }] }, "Paid", "Partial"] } } },
    ],
    { new: true }
  );
  if (!sale) {
    const existing = await Sale.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Sale not found" });
    const owed = Math.max(0, existing.totalAmount - existing.amountPaid);
    throw new HttpError(400, owed <= 0 ? "This sale is already fully paid." : `That's more than is owed — the balance is ₦${owed.toLocaleString("en-NG")}.`);
  }
  audit(req, "sale.payment", `Payment of ₦${amount.toLocaleString("en-NG")} on ${sale.productName}${sale.customerName ? " (" + sale.customerName + ")" : ""}`);
  const out = sale.toObject();
  if (req.admin.role !== "owner") delete out.costPriceAtSale;
  res.status(201).json(out);
});

// DELETE /api/sales/:id/payments/:paymentId — owner only: undo a wrongly recorded payment
router.delete("/:id/payments/:paymentId", requireOwner, async (req, res) => {
  if (!isId(req.params.paymentId)) throw new HttpError(400, "Invalid payment");
  const existing = await Sale.findOne({ _id: req.params.id, "payments._id": req.params.paymentId });
  if (!existing) return res.status(404).json({ error: "Payment not found" });
  const payment = existing.payments.id(req.params.paymentId);
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, "payments._id": req.params.paymentId },
    [
      { $set: { amountPaid: { $max: [0, { $subtract: ["$amountPaid", payment.amount] }] }, payments: { $filter: { input: "$payments", cond: { $ne: ["$$this._id", payment._id] } } } } },
      { $set: { paymentStatus: { $cond: [{ $gte: ["$amountPaid", { $subtract: ["$totalAmount", 0.005] }] }, "Paid", { $cond: [{ $gt: ["$amountPaid", 0] }, "Partial", "Unpaid"] }] } } },
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

  const productDoc = await Product.findOneAndUpdate({ _id: sale.product }, { $inc: { quantity: sale.quantity } }, { new: true });
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
