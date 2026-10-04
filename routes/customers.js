const express = require("express");
const Customer = require("../models/Customer");
const Sale = require("../models/Sale");
const { requireOwner } = require("../middleware/auth");
const { validateIdParam } = require("../utils/helpers");

const router = express.Router();
router.param("id", validateIdParam);

router.use(requireOwner);

// GET /api/customers — every customer, with totals computed from their sales
router.get("/", async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });

    // One aggregation covers every customer's totals at once, rather than
    // running a separate query per customer.
    const totals = await Sale.aggregate([
      { $match: { customerPhone: { $in: customers.map(c => c.phone) } } },
      {
        $group: {
          _id: "$customerPhone",
          totalSpent: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$amountPaid" },
          purchaseCount: { $sum: 1 },
          lastPurchase: { $max: "$date" },
        },
      },
    ]);
    const totalsByPhone = Object.fromEntries(totals.map(t => [t._id, t]));

    const result = customers.map(c => {
      const t = totalsByPhone[c.phone] || { totalSpent: 0, totalPaid: 0, purchaseCount: 0, lastPurchase: null };
      return {
        ...c.toObject(),
        totalSpent: t.totalSpent,
        outstandingBalance: t.totalSpent - t.totalPaid,
        purchaseCount: t.purchaseCount,
        lastPurchase: t.lastPurchase,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/customers/:id — full purchase history for one customer
router.get("/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const sales = await Sale.find({ customerPhone: customer.phone }).sort({ date: -1 });
    const totalSpent = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalPaid = sales.reduce((sum, s) => sum + s.amountPaid, 0);

    res.json({
      ...customer.toObject(),
      sales,
      totalSpent,
      outstandingBalance: totalSpent - totalPaid,
      purchaseCount: sales.length,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// PUT /api/customers/:id — edit profile info (name, whatsapp, location, notes)
router.put("/:id", async (req, res) => {
  const updates = {};
  for (const [key, max] of [["name", 100], ["whatsapp", 30], ["location", 300], ["notes", 2000]]) {
    if (req.body[key] === undefined) continue;
    if (typeof req.body[key] !== "string") return res.status(400).json({ error: `${key} must be text` });
    updates[key] = req.body[key].trim().slice(0, max);
  }
  if (updates.name === "") delete updates.name; // a customer always keeps a name
  const customer = await Customer.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!customer) return res.status(404).json({ error: "Customer not found" });
  res.json(customer);
});

module.exports = router;
