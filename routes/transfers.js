const express = require("express");
const crypto = require("crypto");
const Product = require("../models/Product");
const Transfer = require("../models/Transfer");
const { requireAdmin } = require("../middleware/auth");
const { dateFilterFromQuery } = require("../utils/dates");
const { HttpError, requireNumber, isId } = require("../utils/helpers");
const { resolveLocation, defaultLocation } = require("../utils/locationHelpers");
const stock = require("../utils/stock");
const { audit } = require("../utils/audit");

const router = express.Router();
router.use(requireAdmin);

// GET /api/transfers — history of stock moved between locations (newest first)
router.get("/", async (req, res) => {
  const range = dateFilterFromQuery(req.query);
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  res.json(await Transfer.find(range.date ? { at: range.date } : {}).sort({ at: -1 }).limit(limit));
});

// POST /api/transfers — body: { from, to, note?, items: [{ product, quantity }] }
// (a single { product, quantity } is also accepted). Moves stock between two locations.
// Every line is checked for availability BEFORE anything moves, so a move is
// all-or-nothing in normal use; each line is then moved with one atomic update.
router.post("/", async (req, res) => {
  const from = await resolveLocation(req.body.from === undefined ? "" : req.body.from, "receiving");
  if (req.body.to === undefined || req.body.to === "") throw new HttpError(400, "Choose where the stock is going.");
  const to = await resolveLocation(req.body.to, "selling");
  if (String(from._id) === String(to._id)) throw new HttpError(400, "Choose two different locations.");

  const items = Array.isArray(req.body.items) ? req.body.items : req.body.product ? [{ product: req.body.product, quantity: req.body.quantity }] : [];
  if (items.length === 0) throw new HttpError(400, "Add at least one product to move.");
  if (items.length > 200) throw new HttpError(400, "Too many products in one move (200 at most).");
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

  const wanted = new Map();
  for (const it of items) {
    if (!it || !isId(String(it.product))) throw new HttpError(400, "A line has an invalid product.");
    const qty = requireNumber(it.quantity, "quantity", { min: 0, exclusiveMin: true });
    wanted.set(String(it.product), (wanted.get(String(it.product)) || 0) + qty);
  }

  const products = await Product.find({ _id: { $in: [...wanted.keys()] } }).populate("category", "name");
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const short = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    if (!p) throw new HttpError(400, "One of the products no longer exists.");
    const have = stock.quantityAt(p, from._id);
    if (have < qty) short.push(`${p.name}: ${have} at ${from.name}, you asked for ${qty}`);
  }
  if (short.length) throw new HttpError(400, `Not enough stock at ${from.name} — ${short.join("; ")}`);

  const fallback = await defaultLocation("selling");
  const batch = crypto.randomBytes(6).toString("hex");
  const moved = [];
  const failed = [];
  for (const [id, qty] of wanted) {
    const p = byId.get(id);
    const ok = await stock.move(Product, p._id, from._id, to._id, qty, fallback && fallback._id);
    if (!ok) { failed.push(p.name); continue; }
    moved.push(
      await Transfer.create({
        product: p._id, productName: p.name, productRef: p.ref, categoryName: p.category?.name || "",
        from: from._id, fromName: from.name, to: to._id, toName: to.name, quantity: qty, note, batch,
        by: req.admin.id, byName: req.admin.name || req.admin.email || req.admin.phone || "",
      })
    );
  }

  if (moved.length) audit(req, "stock.transfer", `Moved ${moved.length} product${moved.length === 1 ? "" : "s"} from ${from.name} to ${to.name}${note ? " — " + note : ""}`);
  if (failed.length) {
    throw new HttpError(409, `Moved ${moved.length}, but ${failed.join(", ")} changed while moving (someone sold or moved it at the same moment). Check the stock and try those again.`);
  }
  res.status(201).json({ message: `Moved ${moved.length} product${moved.length === 1 ? "" : "s"} from ${from.name} to ${to.name}.`, transfers: moved });
});

module.exports = router;
