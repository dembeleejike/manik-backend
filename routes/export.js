const express = require("express");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Customer = require("../models/Customer");
const Quote = require("../models/Quote");
const Category = require("../models/Category");
const Project = require("../models/Project");
const { requireOwner } = require("../middleware/auth");

const router = express.Router();

router.use(requireOwner); // backups contain financial data — owner only

// GET /api/export/backup — a full JSON dump of every business record.
// Downloaded as a file by the dashboard's "Download backup" button.
router.get("/backup", async (req, res) => {
  try {
    const [products, categories, sales, purchases, expenses, customers, quotes, projects] = await Promise.all([
      Product.find(), Category.find(), Sale.find(), Purchase.find(),
      Expense.find(), Customer.find(), Quote.find(), Project.find(),
    ]);

    res.setHeader("Content-Disposition", `attachment; filename="manik-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({
      exportedAt: new Date(),
      products, categories, sales, purchases, expenses, customers, quotes, projects,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// Turns an array of plain objects into a CSV string. Simple and dependency-free —
// good enough for straightforward business records with no nested objects.
function toCsv(rows, columns) {
  const header = columns.map(c => c.label).join(",");
  const lines = rows.map(row =>
    columns.map(c => {
      let val = c.get(row);
      if (val == null) val = "";
      val = String(val).replace(/"/g, '""');
      return /[,"\n]/.test(val) ? `"${val}"` : val;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

// GET /api/export/sales.csv — sales as a spreadsheet-friendly CSV
router.get("/sales.csv", async (req, res) => {
  try {
    const sales = await Sale.find().sort({ date: -1 });
    const csv = toCsv(sales, [
      { label: "Date", get: s => new Date(s.date).toLocaleDateString() },
      { label: "Product", get: s => s.productName },
      { label: "Quantity", get: s => s.quantity },
      { label: "Unit Price", get: s => s.unitPrice },
      { label: "Total Amount", get: s => s.totalAmount },
      { label: "Customer", get: s => s.customerName },
      { label: "Phone", get: s => s.customerPhone },
      { label: "Payment Status", get: s => s.paymentStatus },
      { label: "Amount Paid", get: s => s.amountPaid },
      { label: "Payment Method", get: s => s.paymentMethod },
    ]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="manik-sales-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
