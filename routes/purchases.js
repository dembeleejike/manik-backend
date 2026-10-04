const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery, parseRangeBound } = require("../utils/dates");
const { HttpError, validateIdParam, requireNumber, computeStatus, isId } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

// All purchase routes are admin-only — this is internal business data,
// never shown to public site visitors.
router.use(requireAdmin);

const clip = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// GET /api/purchases — optionally ?from=&to= for a date range
router.get("/", async (req, res) => {
  // What the shop paid is owner-only: staff see what was bought and from whom, not the prices.
  const purchases = await Purchase.find(dateFilterFromQuery(req.query))
    .select(req.admin.role === "owner" ? "" : "-unitCost -totalCost")
    .populate("product", "name ref")
    .sort({ date: -1 });
  res.json(purchases);
});

// POST /api/purchases — records a stock-in and increases the product's quantity
router.post("/", async (req, res) => {
  const { product, supplier, invoiceRef, date, notes } = req.body;
  if (!isId(product)) throw new HttpError(400, "A valid product is required");
  const quantity = requireNumber(req.body.quantity, "quantity", { min: 0, exclusiveMin: true });
  const unitCost = requireNumber(req.body.unitCost, "unitCost", { min: 0 });

  let purchaseDate;
  if (date) {
    purchaseDate = parseRangeBound(date, "from");
    if (!purchaseDate) throw new HttpError(400, "Invalid date");
  }

  // Stock-in increases quantity (atomically), and updates the product's cost
  // price to the latest purchase price — a simple, common inventory approach.
  const productDoc = await Product.findOneAndUpdate(
    { _id: product },
    { $inc: { quantity }, $set: { costPrice: unitCost } },
    { new: true }
  );
  if (!productDoc) return res.status(404).json({ error: "Product not found" });

  let purchase;
  try {
    purchase = await Purchase.create({
      product, productName: productDoc.name, quantity, unitCost, totalCost: quantity * unitCost,
      supplier: clip(supplier, 200), invoiceRef: clip(invoiceRef, 100), date: purchaseDate, notes: clip(notes, 2000),
      recordedBy: req.admin.id,
    });
  } catch (err) {
    await Product.updateOne({ _id: product }, { $inc: { quantity: -quantity } }); // undo the stock-in
    throw err;
  }

  const newStatus = computeStatus(productDoc);
  if (newStatus !== productDoc.status) {
    productDoc.status = newStatus;
    await productDoc.save();
  }

  audit(req, "purchase.create", `Stock in: ${purchase.quantity} × ${purchase.productName} at ₦${Number(unitCost).toLocaleString("en-NG")} each${purchase.supplier ? " from " + purchase.supplier : ""}`);
  const purchaseOut = purchase.toObject();
  if (req.admin.role !== "owner") { delete purchaseOut.unitCost; delete purchaseOut.totalCost; }
  res.status(201).json(purchaseOut);
});

// DELETE /api/purchases/:id — reverses the stock increase before deleting
router.delete("/:id", requireOwner, async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });

  // Subtract atomically, never dropping below zero.
  const productDoc = await Product.findOneAndUpdate(
    { _id: purchase.product },
    [{ $set: { quantity: { $max: [0, { $subtract: ["$quantity", purchase.quantity] }] } } }],
    { new: true }
  );
  if (productDoc) {
    const newStatus = computeStatus(productDoc);
    if (newStatus !== productDoc.status) {
      productDoc.status = newStatus;
      await productDoc.save();
    }
  }

  await purchase.deleteOne();
  audit(req, "purchase.delete", `Deleted purchase: ${purchase.quantity} × ${purchase.productName} (₦${Number(purchase.totalCost).toLocaleString("en-NG")})`);
  res.json({ message: "Purchase deleted and stock adjusted" });
});

module.exports = router;
