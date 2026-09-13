const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// All purchase routes are admin-only — this is internal business data,
// never shown to public site visitors.
router.use(requireAdmin);

// GET /api/purchases — optionally ?from=&to= for a date range
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  const purchases = await Purchase.find(filter).populate("product", "name ref").sort({ date: -1 });
  res.json(purchases);
});

// POST /api/purchases — records a stock-in and increases the product's quantity
router.post("/", async (req, res) => {
  try {
    const { product, quantity, unitCost, supplier, invoiceRef, date, notes } = req.body;
    if (!product || !quantity || unitCost == null) {
      return res.status(400).json({ error: "product, quantity and unitCost are required" });
    }

    const productDoc = await Product.findById(product);
    if (!productDoc) return res.status(404).json({ error: "Product not found" });

    const totalCost = Number(quantity) * Number(unitCost);

    const purchase = await Purchase.create({
      product, productName: productDoc.name, quantity, unitCost, totalCost,
      supplier, invoiceRef, date, notes, recordedBy: req.admin.id,
    });

    // Stock-in increases quantity, and updates the product's cost price
    // to the latest purchase price — a simple, common inventory approach.
    productDoc.quantity += Number(quantity);
    productDoc.costPrice = Number(unitCost);
    if (productDoc.quantity > productDoc.lowStockThreshold) productDoc.status = "In stock";
    await productDoc.save();

    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/purchases/:id — reverses the stock increase before deleting
router.delete("/:id", async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });

  const productDoc = await Product.findById(purchase.product);
  if (productDoc) {
    productDoc.quantity = Math.max(0, productDoc.quantity - purchase.quantity);
    await productDoc.save();
  }

  await purchase.deleteOne();
  res.json({ message: "Purchase deleted and stock adjusted" });
});

module.exports = router;
