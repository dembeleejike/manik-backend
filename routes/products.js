const express = require("express");
const Product = require("../models/Product");
const { requireAdmin } = require("../middleware/auth");
const { upload, uploadAll } = require("../config/cloudinary");

const router = express.Router();

// GET /api/products — public. Supports ?category=<id> and ?search=<text>
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) {
    const term = req.query.search.trim();
    filter.$or = [
      { name: { $regex: term, $options: "i" } },
      { ref: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
    ];
  }
  const products = await Product.find(filter).populate("category").sort({ createdAt: -1 });
  res.json(products);
});

// GET /api/products/:id — public, single product detail
router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id).populate("category");
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// POST /api/products — admin only, with optional image uploads (field name: "images")
router.post("/", requireAdmin, upload.array("images", 6), async (req, res) => {
  try {
    const { name, ref, category, description, status, colors, specs, quantity, costPrice, sellingPrice, lowStockThreshold } = req.body;
    if (!name || !ref || !category) {
      return res.status(400).json({ error: "name, ref and category are required" });
    }

    const images = await uploadAll(req.files); // Cloudinary URLs

    const product = await Product.create({
      name,
      ref,
      category,
      description,
      status,
      colors: colors ? JSON.parse(colors) : [],
      specs: specs ? JSON.parse(specs) : [],
      quantity: quantity || 0,
      costPrice: costPrice || 0,
      sellingPrice: sellingPrice || 0,
      lowStockThreshold: lowStockThreshold || 5,
      images,
    });

    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A product with this reference code already exists" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// PUT /api/products/:id — admin only, add more images optionally
router.put("/:id", requireAdmin, upload.array("images", 6), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.colors) updates.colors = JSON.parse(updates.colors);
    if (updates.specs) updates.specs = JSON.parse(updates.specs);

    if (req.files && req.files.length > 0) {
      const newImages = await uploadAll(req.files);
      const existing = await Product.findById(req.params.id);
      updates.images = [...(existing?.images || []), ...newImages];
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/products/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ message: "Product deleted" });
});

module.exports = router;
