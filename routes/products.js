const express = require("express");
const Product = require("../models/Product");
const Category = require("../models/Category");
const { requireAdmin, optionalAdmin } = require("../middleware/auth");
const { upload, uploadAll, deleteImagesByUrls } = require("../config/cloudinary");
const Sale = require("../models/Sale");
const StockAdjustment = require("../models/StockAdjustment");
const Purchase = require("../models/Purchase");
const { escapeRegex, HttpError, validateIdParam, parseJsonField, requireNumber, isId } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

// What each kind of viewer may see:
//  - website visitors: no cost, no selling price, no exact stock levels
//  - staff accounts:   everything EXCEPT what the shop pays (cost price)
//  - owner accounts:   everything
const PUBLIC_HIDDEN = "-costPrice -sellingPrice -quantity -lowStockThreshold";
const STAFF_HIDDEN = "-costPrice";
const visibleFields = (req) => (!req.admin ? PUBLIC_HIDDEN : req.admin.role === "owner" ? "" : STAFF_HIDDEN);

// GET /api/products — public. Supports ?category=<id> and ?search=<text>
router.get("/", optionalAdmin, async (req, res) => {
  const filter = {};
  if (req.query.category) {
    if (!isId(req.query.category)) return res.status(400).json({ error: "Invalid category" });
    filter.category = req.query.category;
  }
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const term = escapeRegex(req.query.search.trim().slice(0, 100));
    filter.$or = [
      { name: { $regex: term, $options: "i" } },
      { ref: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
    ];
  }
  const products = await Product.find(filter).select(visibleFields(req)).populate("category").sort({ createdAt: -1 });
  res.json(products);
});

// GET /api/products/:id — public, single product detail
router.get("/:id", optionalAdmin, async (req, res) => {
  const product = await Product.findById(req.params.id).select(visibleFields(req)).populate("category");
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// Removes the owner-only cost price from a product before it is sent to staff.
function forViewer(product, req) {
  const obj = product.toObject ? product.toObject() : { ...product };
  if (req.admin.role !== "owner") delete obj.costPrice;
  return obj;
}

const MAX_PHOTOS = 8; // per product

const STATUSES = ["In stock", "Low stock", "Made to order", "Out of stock"];

// Turns the raw multipart body into a clean, validated set of fields.
// Only whitelisted fields are ever copied — nothing else in req.body can
// reach the database.
function buildProductFields(body, { partial, isOwner = true }) {
  const out = {};
  const text = (key, max) => {
    if (body[key] === undefined) return;
    if (typeof body[key] !== "string") throw new HttpError(400, `${key} must be text`);
    out[key] = body[key].trim().slice(0, max);
  };
  text("name", 200);
  text("ref", 50);
  text("description", 5000);

  if (body.category !== undefined) {
    if (!isId(body.category)) throw new HttpError(400, "Invalid category");
    out.category = body.category;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, "Invalid status");
    out.status = body.status;
  }
  if (body.colors !== undefined) {
    const colors = parseJsonField(body.colors, "colors", []);
    if (!Array.isArray(colors) || colors.some((c) => typeof c !== "string" || c.length > 20)) throw new HttpError(400, "colors must be a list of colour codes");
    out.colors = colors;
  }
  if (body.specs !== undefined) {
    const specs = parseJsonField(body.specs, "specs", []);
    if (!Array.isArray(specs) || specs.some((s) => !s || typeof s.label !== "string" || typeof s.value !== "string")) throw new HttpError(400, "specs must be a list of label/value pairs");
    out.specs = specs.map((s) => ({ label: s.label.slice(0, 100), value: s.value.slice(0, 300) }));
  }
  // Staff accounts can never set or change the cost price — it is owner-only
  // information, and it is also updated automatically from recorded purchases.
  for (const key of ["quantity", "costPrice", "sellingPrice", "lowStockThreshold"]) {
    if (key === "costPrice" && !isOwner) continue;
    if (body[key] !== undefined && body[key] !== "") out[key] = requireNumber(body[key], key, { min: 0 });
  }
  if (body.isFeatured !== undefined) out.isFeatured = body.isFeatured === true || body.isFeatured === "true";

  if (!partial && (!out.name || !out.ref || !out.category)) {
    throw new HttpError(400, "name, ref and category are required");
  }
  if (out.name === "" || out.ref === "") throw new HttpError(400, "name and ref can't be empty");
  return out;
}

// POST /api/products — admin only, with optional image uploads (field name: "images")
router.post("/", requireAdmin, upload.array("images", 6), async (req, res) => {
  const fields = buildProductFields(req.body, { partial: false, isOwner: req.admin.role === "owner" });
  if (!(await Category.exists({ _id: fields.category }))) return res.status(400).json({ error: "That category doesn't exist" });

  if ((req.files || []).length > MAX_PHOTOS) throw new HttpError(400, `A product can have at most ${MAX_PHOTOS} photos.`);
  const images = await uploadAll(req.files); // Cloudinary URLs
  try {
    const product = await Product.create({ ...fields, images });
    audit(req, "product.create", `Added product: ${product.name} (${product.ref})`);
    res.status(201).json(forViewer(product, req));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A product with this reference code already exists" });
    throw err;
  }
});

// PUT /api/products/:id — admin only, add more images optionally
router.put("/:id", requireAdmin, upload.array("images", 6), async (req, res) => {
  const updates = buildProductFields(req.body, { partial: true, isOwner: req.admin.role === "owner" });
  if (updates.category && !(await Category.exists({ _id: updates.category }))) {
    return res.status(400).json({ error: "That category doesn't exist" });
  }

  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  // Photos: remove the ones asked for, then add new ones — checking the limit
  // BEFORE uploading anything, so a refused request never wastes storage.
  const removeList = parseJsonField(req.body.removeImages, "removeImages", []);
  if (!Array.isArray(removeList) || removeList.some((u) => typeof u !== "string")) throw new HttpError(400, "removeImages must be a list of photo links");
  const current = existing.images || [];
  const removed = current.filter((u) => removeList.includes(u));
  const kept = current.filter((u) => !removeList.includes(u));
  const incoming = (req.files || []).length;
  if (kept.length + incoming > MAX_PHOTOS) {
    throw new HttpError(400, `A product can have at most ${MAX_PHOTOS} photos (it has ${kept.length}${removed.length ? " after removing" : ""}; you tried to add ${incoming}). Remove some first.`);
  }
  if (removed.length || incoming) {
    updates.images = [...kept, ...(incoming ? await uploadAll(req.files) : [])];
  }

  try {
    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (removed.length) deleteImagesByUrls(removed); // free the storage (best effort)
    // A hand-typed stock change is recorded, so a number never changes without a trace.
    if (updates.quantity !== undefined && updates.quantity !== existing.quantity) {
      await StockAdjustment.create({
        product: existing._id, productName: existing.name, productRef: existing.ref, before: existing.quantity, after: updates.quantity,
        difference: updates.quantity - existing.quantity, unitCost: existing.costPrice || 0, reason: "Correction", note: "Edited on the product",
        by: req.admin.id, byName: req.admin.name || req.admin.email || req.admin.phone || "",
      });
    }
    const changed = Object.keys(updates).filter((k) => k !== "images").join(", ");
    audit(req, "product.update", `Edited product: ${product.name} (${product.ref})${changed ? " — " + changed : ""}${updates.images ? " — photos" : ""}${removed.length ? ` (${removed.length} removed)` : ""}`);
    res.json(forViewer(product, req));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A product with this reference code already exists" });
    throw err;
  }
});

// DELETE /api/products/:id — admin only. A product that has sales or purchases
// recorded against it can't be deleted: those records (and the reports built
// from them) would be left pointing at nothing. Mark it "Out of stock" instead.
router.delete("/:id", requireAdmin, async (req, res) => {
  const [salesCount, purchasesCount] = await Promise.all([
    Sale.countDocuments({ product: req.params.id }),
    Purchase.countDocuments({ product: req.params.id }),
  ]);
  if (salesCount + purchasesCount > 0) {
    return res.status(409).json({
      error: "This product has sales or purchases recorded, so it can't be deleted. Set its status to \"Out of stock\" instead.",
    });
  }
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  deleteImagesByUrls(product.images); // fire-and-forget cleanup
  audit(req, "product.delete", `Deleted product: ${product.name} (${product.ref})`);
  res.json({ message: "Product deleted" });
});

module.exports = router;
