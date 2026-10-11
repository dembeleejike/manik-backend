const express = require("express");
const Purchase = require("../models/Purchase");
const Product = require("../models/Product");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery, parseRangeBound } = require("../utils/dates");
const stock = require("../utils/stock");
const { resolveLocation, defaultLocation } = require("../utils/locationHelpers");
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
    .select(req.admin.isOwner ? "" : "-unitCost -totalCost")
    .populate("product", "name ref")
    .sort({ date: -1 });
  res.json(purchases);
});

// POST /api/purchases — records a stock-in at a location (the warehouse unless another is chosen)
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

  const location = await resolveLocation(req.body.location, "receiving");
  const fallback = await defaultLocation("selling");
  if (!(await Product.exists({ _id: product }))) return res.status(404).json({ error: "Product not found" });

  // Stock-in adds to that location (atomically, with the total), and updates the
  // product's cost price to the latest purchase price — a simple, common approach.
  await stock.put(Product, product, location._id, quantity, fallback && fallback._id);
  const productDoc = await Product.findOneAndUpdate({ _id: product }, { $set: { costPrice: unitCost } }, { new: true });

  let purchase;
  try {
    purchase = await Purchase.create({
      product, productName: productDoc.name, quantity, unitCost, totalCost: quantity * unitCost,
      supplier: clip(supplier, 200), invoiceRef: clip(invoiceRef, 100), date: purchaseDate, notes: clip(notes, 2000),
      location: location._id, locationName: location.name, recordedBy: req.admin.id,
    });
  } catch (err) {
    await stock.takeUpTo(Product, product, location._id, quantity); // undo the stock-in
    throw err;
  }

  const newStatus = computeStatus(productDoc);
  if (newStatus !== productDoc.status) {
    productDoc.status = newStatus;
    await productDoc.save();
  }

  audit(req, "purchase.create", `Stock in at ${location.name}: ${purchase.quantity} × ${purchase.productName} at ₦${Number(unitCost).toLocaleString("en-NG")} each${purchase.supplier ? " from " + purchase.supplier : ""}`);
  const purchaseOut = purchase.toObject();
  if (!req.admin.isOwner) { delete purchaseOut.unitCost; delete purchaseOut.totalCost; }
  res.status(201).json(purchaseOut);
});

// DELETE /api/purchases/:id — reverses the stock increase before deleting
router.delete("/:id", requireOwner, async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) return res.status(404).json({ error: "Purchase not found" });

  // Take the goods back out of the location they were delivered to — never more than is
  // still there (some may already have been sold or moved).
  const fallback = await defaultLocation("receiving");
  const where = purchase.location || (fallback && fallback._id);
  if (where) await stock.takeUpTo(Product, purchase.product, where, purchase.quantity, fallback && fallback._id);
  const productDoc = await Product.findById(purchase.product);
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
