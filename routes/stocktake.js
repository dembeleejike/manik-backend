const express = require("express");
const crypto = require("crypto");
const Product = require("../models/Product");
const StockAdjustment = require("../models/StockAdjustment");
const { requireAdmin } = require("../middleware/auth");
const { dateFilterFromQuery } = require("../utils/dates");
const { HttpError, requireNumber, computeStatus, isId } = require("../utils/helpers");
const { audit } = require("../utils/audit");

const router = express.Router();
router.use(requireAdmin);

// GET /api/stocktake — history of every manual stock change, newest first.
// What a shortage COST is owner-only, like all cost information.
router.get("/", async (req, res) => {
  const range = dateFilterFromQuery(req.query);
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  const rows = await StockAdjustment.find(range.date ? { at: range.date } : {})
    .select(req.admin.role === "owner" ? "" : "-unitCost")
    .sort({ at: -1 })
    .limit(limit);
  res.json(rows);
});

// POST /api/stocktake — body: { note?, counts: [{ product, counted }] }
// Sets each product's quantity to what was physically counted and records the
// difference. Products whose count matches the system are left alone.
router.post("/", async (req, res) => {
  const { counts } = req.body;
  if (!Array.isArray(counts) || counts.length === 0) throw new HttpError(400, "Enter at least one counted quantity");
  if (counts.length > 1000) throw new HttpError(400, "Too many products in one stock count");
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

  // Validate everything before changing anything.
  const wanted = new Map();
  for (const c of counts) {
    if (!c || !isId(String(c.product))) throw new HttpError(400, "A counted line has an invalid product");
    wanted.set(String(c.product), requireNumber(c.counted, "Counted quantity", { min: 0 }));
  }

  const batch = crypto.randomBytes(6).toString("hex");
  const owner = req.admin.role === "owner";
  const lines = [];
  for (const [id, counted] of wanted) {
    // Atomic swap: returns the quantity as it was at the moment of the update, so
    // "before" is exact even if a sale happened a second earlier.
    const old = await Product.findOneAndUpdate({ _id: id }, { $set: { quantity: counted } }, { new: false });
    if (!old) continue;
    if (old.quantity === counted) continue;

    const updated = await Product.findById(id);
    const status = computeStatus(updated);
    if (status !== updated.status) { updated.status = status; await updated.save(); }

    const adj = await StockAdjustment.create({
      product: old._id, productName: old.name, productRef: old.ref, before: old.quantity, after: counted,
      difference: counted - old.quantity, unitCost: old.costPrice || 0, reason: "Stocktake", note, batch,
      by: req.admin.id, byName: req.admin.name || req.admin.email || req.admin.phone || "",
    });
    const line = adj.toObject();
    if (!owner) delete line.unitCost;
    lines.push(line);
  }

  const short = lines.filter((l) => l.difference < 0).length;
  const over = lines.filter((l) => l.difference > 0).length;
  audit(req, "stocktake", `Stock count: ${wanted.size} products counted, ${lines.length} changed (${short} short, ${over} over)${note ? " — " + note : ""}`);
  res.status(201).json({
    message: lines.length ? `Stock count saved: ${lines.length} product${lines.length === 1 ? "" : "s"} adjusted.` : "Stock count saved: everything matched, nothing needed adjusting.",
    adjusted: lines.length, lines,
  });
});

module.exports = router;
