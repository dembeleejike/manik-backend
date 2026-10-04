const express = require("express");
const Quotation = require("../models/Quotation");
const Product = require("../models/Product");
const Quote = require("../models/Quote");
const Counter = require("../models/Counter");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { recordSale } = require("../utils/salesService");
const { parseRangeBound } = require("../utils/dates");
const { HttpError, validateIdParam, requireNumber, isId } = require("../utils/helpers");
const { audit } = require("../utils/audit");

const router = express.Router();
router.param("id", validateIdParam);
router.use(requireAdmin);

const OPEN = ["Draft", "Sent", "Accepted"]; // can still be edited / converted
const SETTABLE = ["Draft", "Sent", "Accepted", "Declined"];
const round2 = (n) => Math.round(n * 100) / 100;
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Validates and cleans the editable fields of a quotation.
async function cleanQuotation(body) {
  const out = {
    customerName: text(body.customerName, 100),
    customerPhone: text(body.customerPhone, 30),
    customerLocation: text(body.customerLocation, 300),
    notes: text(body.notes, 2000),
  };
  if (!out.customerName) throw new HttpError(400, "Customer name is required");

  if (!Array.isArray(body.lines) || body.lines.length === 0) throw new HttpError(400, "Add at least one item to the quotation");
  if (body.lines.length > 60) throw new HttpError(400, "A quotation can have at most 60 lines");
  out.lines = body.lines.map((l, i) => {
    const description = text(l && l.description, 300);
    if (!description) throw new HttpError(400, `Line ${i + 1} needs a description`);
    const line = {
      description,
      quantity: requireNumber(l.quantity, `Line ${i + 1} quantity`, { min: 0, exclusiveMin: true }),
      unitPrice: requireNumber(l.unitPrice, `Line ${i + 1} price`, { min: 0 }),
    };
    if (l.product) {
      if (!isId(String(l.product))) throw new HttpError(400, `Line ${i + 1} has an invalid product`);
      line.product = l.product;
    }
    return line;
  });

  const subtotal = out.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  out.discount = body.discount === undefined || body.discount === "" ? 0 : requireNumber(body.discount, "discount", { min: 0 });
  if (out.discount > subtotal + 0.005) throw new HttpError(400, "The discount can't be more than the subtotal");

  if (body.validUntil) {
    out.validUntil = parseRangeBound(body.validUntil, "to");
    if (!out.validUntil) throw new HttpError(400, "Invalid 'valid until' date");
  }
  return out;
}

// GET /api/quotations
router.get("/", async (req, res) => {
  res.json(await Quotation.find().sort({ createdAt: -1 }).limit(1000));
});

// GET /api/quotations/:id
router.get("/:id", async (req, res) => {
  const q = await Quotation.findById(req.params.id);
  if (!q) return res.status(404).json({ error: "Quotation not found" });
  res.json(q);
});

// POST /api/quotations
router.post("/", async (req, res) => {
  const fields = await cleanQuotation(req.body);
  if (!fields.validUntil) fields.validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // valid for 14 days by default
  if (req.body.fromQuote) {
    if (!isId(String(req.body.fromQuote))) throw new HttpError(400, "Invalid enquiry");
    fields.fromQuote = req.body.fromQuote;
  }

  // Number: Q-<year>-<running number>. If a restore left the counter behind and a
  // number is already taken, just take the next one until it is free.
  const year = new Date().getFullYear();
  let quotation;
  for (let attempt = 0; attempt < 8 && !quotation; attempt++) {
    const n = await Counter.nextNumber(`quotation-${year}`);
    try {
      quotation = await Quotation.create({ ...fields, number: `Q-${year}-${String(n).padStart(4, "0")}`, createdBy: req.admin.id });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!quotation) throw new HttpError(500, "Couldn't allocate a quotation number. Please try again.");

  if (fields.fromQuote) await Quote.updateOne({ _id: fields.fromQuote, status: "New" }, { status: "Contacted" });
  audit(req, "quotation.create", `Created quotation ${quotation.number} for ${quotation.customerName}`);
  res.status(201).json(quotation);
});

// PUT /api/quotations/:id — edit (only while it hasn't been converted or declined)
router.put("/:id", async (req, res) => {
  const existing = await Quotation.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Quotation not found" });
  if (!OPEN.includes(existing.status)) throw new HttpError(400, `A ${existing.status.toLowerCase()} quotation can't be edited.`);
  const fields = await cleanQuotation(req.body);
  if (!fields.validUntil) fields.validUntil = existing.validUntil;
  Object.assign(existing, fields);
  await existing.save();
  audit(req, "quotation.update", `Edited quotation ${existing.number}`);
  res.json(existing);
});

// PUT /api/quotations/:id/status — Draft / Sent / Accepted / Declined
router.put("/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!SETTABLE.includes(status)) throw new HttpError(400, `Status must be one of: ${SETTABLE.join(", ")}`);
  const q = await Quotation.findOneAndUpdate({ _id: req.params.id, status: { $ne: "Converted" } }, { status }, { new: true });
  if (!q) return res.status(404).json({ error: "Quotation not found, or it has already been converted to sales" });
  audit(req, "quotation.status", `Quotation ${q.number} marked ${status}`);
  res.json(q);
});

// DELETE /api/quotations/:id — owner only
router.delete("/:id", requireOwner, async (req, res) => {
  const q = await Quotation.findByIdAndDelete(req.params.id);
  if (!q) return res.status(404).json({ error: "Quotation not found" });
  audit(req, "quotation.delete", `Deleted quotation ${q.number} (${q.customerName})`);
  res.json({ message: "Quotation deleted" });
});

// POST /api/quotations/:id/convert — the customer accepted: turn the stock items
// into real sales (taking stock). Body: { paymentMethod?, deposit? }
//  - A discount is spread across the lines so the sales add up to the quoted total.
//  - A deposit is applied to the sales in order (the rest stays as a balance owed,
//    which can be paid off later from the Sales page).
//  - Lines with no product (e.g. installation, delivery) can't be sold from stock;
//    they're returned in `skipped` so they can be recorded separately.
router.post("/:id/convert", async (req, res) => {
  const q = await Quotation.findById(req.params.id);
  if (!q) return res.status(404).json({ error: "Quotation not found" });
  if (!OPEN.includes(q.status)) throw new HttpError(400, q.status === "Converted" ? "This quotation has already been converted to sales." : "A declined quotation can't be converted.");

  const stockLines = q.lines.filter((l) => l.product);
  const skipped = q.lines.filter((l) => !l.product).map((l) => l.description);
  if (stockLines.length === 0) throw new HttpError(400, "None of the items are linked to a product in stock, so there is nothing to sell. Link items to products when editing the quotation.");

  // Check ALL the stock first, so we don't sell half of a quotation and then fail.
  const need = new Map();
  for (const l of stockLines) need.set(String(l.product), (need.get(String(l.product)) || 0) + l.quantity);
  const products = await Product.find({ _id: { $in: [...need.keys()] } });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const short = [];
  for (const [id, qty] of need) {
    const p = byId.get(id);
    if (!p) short.push("a product that no longer exists");
    else if (p.quantity < qty) short.push(`${p.name} (need ${qty}, have ${p.quantity})`);
  }
  if (short.length) throw new HttpError(400, `Not enough stock: ${short.join("; ")}`);

  const method = req.body.paymentMethod === undefined ? "Cash" : req.body.paymentMethod;
  let deposit = req.body.deposit === undefined || req.body.deposit === "" ? 0 : requireNumber(req.body.deposit, "deposit", { min: 0 });

  const subtotal = q.lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const factor = subtotal > 0 ? 1 - q.discount / subtotal : 1;
  const stockTotal = stockLines.reduce((n, l) => n + round2(l.quantity * round2(l.unitPrice * factor)), 0);
  if (deposit > stockTotal + 0.005) throw new HttpError(400, `The deposit can't be more than the total of the stock items (₦${stockTotal.toLocaleString("en-NG")}).`);

  const created = [];
  try {
    for (const l of stockLines) {
      const unitPrice = round2(l.unitPrice * factor);
      const total = round2(l.quantity * unitPrice);
      const pay = Math.min(deposit, total);
      deposit = round2(deposit - pay);
      const { sale } = await recordSale(
        {
          product: l.product, quantity: l.quantity, unitPrice,
          customerName: q.customerName, customerPhone: q.customerPhone,
          paymentStatus: pay >= total - 0.005 ? "Paid" : pay > 0 ? "Partial" : "Unpaid", amountPaid: pay,
          paymentMethod: method, notes: `From quotation ${q.number}`, fromQuotation: q._id,
        },
        req.admin.id
      );
      created.push(sale);
    }
  } catch (err) {
    // Keep a record of what WAS created so nothing is lost or sold twice.
    q.sales = created.map((s) => s._id);
    await q.save();
    throw new HttpError(err.status || 500, `Created ${created.length} of ${stockLines.length} sales, then stopped: ${err.message}`);
  }

  q.status = "Converted";
  q.sales = created.map((s) => s._id);
  await q.save();
  audit(req, "quotation.convert", `Converted quotation ${q.number} into ${created.length} sale${created.length === 1 ? "" : "s"}`);
  res.json({ message: `Created ${created.length} sale${created.length === 1 ? "" : "s"} from ${q.number}.`, quotation: q, skipped });
});

module.exports = router;
