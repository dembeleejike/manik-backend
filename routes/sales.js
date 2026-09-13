const express = require("express");
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Quote = require("../models/Quote");
const Customer = require("../models/Customer");
const { sendLowStockAlert } = require("../utils/sendEmail");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireAdmin); // internal business data only

// GET /api/sales — optionally ?from=&to=
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  const sales = await Sale.find(filter).populate("product", "name ref").sort({ date: -1 });
  res.json(sales);
});

// POST /api/sales — records a sale and decreases the product's quantity.
// Optionally pass fromQuote: <quoteId> to link it and mark that quote Closed.
router.post("/", async (req, res) => {
  try {
    const { product, quantity, unitPrice, customerName, customerPhone, paymentStatus, amountPaid, paymentMethod, date, notes, fromQuote } = req.body;
    if (!product || !quantity || unitPrice == null) {
      return res.status(400).json({ error: "product, quantity and unitPrice are required" });
    }

    const productDoc = await Product.findById(product);
    if (!productDoc) return res.status(404).json({ error: "Product not found" });

    if (productDoc.quantity < Number(quantity)) {
      return res.status(400).json({ error: `Not enough stock — only ${productDoc.quantity} available` });
    }

    const totalAmount = Number(quantity) * Number(unitPrice);
    const status = paymentStatus || "Paid";
    // If marked Paid and no explicit amount given, the full amount was paid —
    // this keeps outstanding-balance math (totalAmount - amountPaid) correct
    // for every sale, not just the ones where Partial/Unpaid was picked.
    const resolvedAmountPaid = amountPaid != null && amountPaid !== ""
      ? Number(amountPaid)
      : (status === "Paid" ? totalAmount : 0);

    const sale = await Sale.create({
      product, productName: productDoc.name, quantity, unitPrice, totalAmount,
      costPriceAtSale: productDoc.costPrice, customerName, customerPhone,
      paymentStatus: status, amountPaid: resolvedAmountPaid, paymentMethod, date, notes, fromQuote,
      recordedBy: req.admin.id,
    });

    // Track threshold-crossing for a low-stock alert (added by the caller below)
    const wasAboveThreshold = productDoc.quantity > productDoc.lowStockThreshold;

    productDoc.quantity -= Number(quantity);
    if (productDoc.quantity === 0) productDoc.status = "Out of stock";
    else if (productDoc.quantity <= productDoc.lowStockThreshold) productDoc.status = "Low stock";
    await productDoc.save();

    if (fromQuote) {
      await Quote.findByIdAndUpdate(fromQuote, { status: "Closed" });
    }

    // Auto-create or update the customer record so their purchase history
    // is trackable, without requiring a separate manual step.
    if (customerPhone) {
      await Customer.findOneAndUpdate(
        { phone: customerPhone },
        { $setOnInsert: { phone: customerPhone }, ...(customerName && { name: customerName }) },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const nowAtOrBelowThreshold = productDoc.quantity <= productDoc.lowStockThreshold;
    if (wasAboveThreshold && nowAtOrBelowThreshold) {
      sendLowStockAlert(productDoc); // fire-and-forget, same pattern as quote notifications
    }

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/sales/:id — reverses the stock decrease before deleting
router.delete("/:id", async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });

  const productDoc = await Product.findById(sale.product);
  if (productDoc) {
    productDoc.quantity += sale.quantity;
    if (productDoc.quantity > productDoc.lowStockThreshold) productDoc.status = "In stock";
    await productDoc.save();
  }

  await sale.deleteOne();
  res.json({ message: "Sale deleted and stock restored" });
});

module.exports = router;
