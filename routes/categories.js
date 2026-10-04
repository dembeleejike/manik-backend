const express = require("express");
const Category = require("../models/Category");
const Product = require("../models/Product");
const { requireAdmin } = require("../middleware/auth");
const { validateIdParam } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

const makeSlug = (name) => name.toLowerCase().trim().replace(/\s+/g, "-");
const validName = (n) => typeof n === "string" && n.trim().length > 0 && n.trim().length <= 100;

// GET /api/categories — public, used by the site's category filter
router.get("/", async (req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json(categories);
});

// POST /api/categories — admin only
router.post("/", requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!validName(name)) return res.status(400).json({ error: "Name is required" });
  try {
    const category = await Category.create({ name: name.trim(), slug: makeSlug(name) });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A category with this name already exists" });
    throw err;
  }
});

// PUT /api/categories/:id — admin only
router.put("/:id", requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!validName(name)) return res.status(400).json({ error: "Name is required" });
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), slug: makeSlug(name) },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json(category);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A category with this name already exists" });
    throw err;
  }
});

// DELETE /api/categories/:id — admin only. Refused while products still use it,
// otherwise those products would be left pointing at a category that's gone.
router.delete("/:id", requireAdmin, async (req, res) => {
  const inUse = await Product.countDocuments({ category: req.params.id });
  if (inUse > 0) {
    return res.status(409).json({ error: `${inUse} product${inUse === 1 ? " still uses" : "s still use"} this category. Move or delete them first.` });
  }
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ error: "Category not found" });
  audit(req, "category.delete", `Deleted category: ${category.name}`);
  res.json({ message: "Category deleted" });
});

module.exports = router;
