const express = require("express");
const Category = require("../models/Category");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET /api/categories — public, used by the site's category filter
router.get("/", async (req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json(categories);
});

// POST /api/categories — admin only
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const category = await Category.create({ name, slug });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A category with this name already exists" });
    }
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// PUT /api/categories/:id — admin only
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const slug = name ? name.toLowerCase().trim().replace(/\s+/g, "-") : undefined;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name, slug }) },
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/categories/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ error: "Category not found" });
  res.json({ message: "Category deleted" });
});

module.exports = router;
