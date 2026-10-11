const express = require("express");
const crypto = require("crypto");
const Product = require("../models/Product");
const Category = require("../models/Category");
const StockAdjustment = require("../models/StockAdjustment");
const { requireAdmin } = require("../middleware/auth");
const { dateFilterFromQuery } = require("../utils/dates");
const { HttpError, requireNumber, computeStatus, isId } = require("../utils/helpers");
const { resolveLocation, defaultLocation } = require("../utils/locationHelpers");
const stock = require("../utils/stock");
const { audit } = require("../utils/audit");

const router = express.Router();
router.use(requireAdmin);

// GET /api/stocktake — history of every stock count and manual correction, newest first.
// What a shortage COST is owner-only, like all cost information.
router.get("/", async (req, res) => {
  const range = dateFilterFromQuery(req.query);
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
  const rows = await StockAdjustment.find(range.date ? { at: range.date } : {})
    .select(req.admin.isOwner ? "" : "-unitCost")
    .sort({ at: -1 })
    .limit(limit);
  res.json(rows);
});

// POST /api/stocktake — body: { location, category?, note?, counts: [{ product, counted }] }
// A stock count is taken for ONE location (e.g. the Shop) and usually ONE category
// (e.g. Glass). Each counted product's quantity AT THAT LOCATION is set to what was
// physically counted, and the difference is recorded. Other locations are untouched.
router.post("/", async (req, res) => {
  const { counts } = req.body;
  if (req.body.location === undefined || req.body.location === "") throw new HttpError(400, "Choose which location you counted (e.g. the Shop or the Warehouse).");
  const location = await resolveLocation(req.body.location, "selling");
  if (!Array.isArray(counts) || counts.length === 0) throw new HttpError(400, "Enter at least one counted quantity");
  if (counts.length > 1000) throw new HttpError(400, "Too many products in one stock count");
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 300) : "";

  let category = null;
  if (req.body.category) {
    if (!isId(String(req.body.category))) throw new HttpError(400, "Invalid category");
    category = await Category.findById(req.body.category);
    if (!category) throw new HttpError(400, "That category doesn't exist");
  }

  // Validate everything before changing anything.
  const wanted = new Map();
  for (const c of counts) {
    if (!c || !isId(String(c.product))) throw new HttpError(400, "A counted line has an invalid product");
    wanted.set(String(c.product), requireNumber(c.counted, "Counted quantity", { min: 0 }));
  }
  const products = await Product.find({ _id: { $in: [...wanted.keys()] } }).populate("category", "name");
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (category) {
    const wrong = products.filter((p) => String(p.category?._id) !== String(category._id));
    if (wrong.length) throw new HttpError(400, `${wrong[0].name} isn't in the ${category.name} category.`);
  }

  const fallback = await defaultLocation("selling");
  const batch = crypto.randomBytes(6).toString("hex");
  const owner = req.admin.isOwner;
  const lines = [];
  for (const [id, counted] of wanted) {
    const p = byId.get(id);
    if (!p) continue;
    const { before, after } = await stock.setAt(Product, p._id, location._id, counted, fallback && fallback._id);
    if (before === after) continue;

    const fresh = await Product.findById(p._id);
    const status = computeStatus(fresh);
    if (status !== fresh.status) { fresh.status = status; await fresh.save(); }

    const adj = await StockAdjustment.create({
      product: p._id, productName: p.name, productRef: p.ref, before, after, difference: after - before, unitCost: p.costPrice || 0,
      location: location._id, locationName: location.name, categoryName: category ? category.name : p.category?.name || "",
      reason: "Stocktake", note, batch, by: req.admin.id, byName: req.admin.name || req.admin.email || req.admin.phone || "",
    });
    const line = adj.toObject();
    if (!owner) delete line.unitCost;
    lines.push(line);
  }

  const short = lines.filter((l) => l.difference < 0).length;
  const over = lines.filter((l) => l.difference > 0).length;
  audit(req, "stocktake", `Stock count at ${location.name}${category ? " (" + category.name + ")" : ""}: ${wanted.size} products counted, ${lines.length} changed (${short} short, ${over} over)${note ? " — " + note : ""}`);
  res.status(201).json({
    message: lines.length ? `Stock count saved: ${lines.length} product${lines.length === 1 ? "" : "s"} adjusted at ${location.name}.` : `Stock count saved: everything at ${location.name} matched, nothing needed adjusting.`,
    adjusted: lines.length, lines,
  });
});

module.exports = router;
