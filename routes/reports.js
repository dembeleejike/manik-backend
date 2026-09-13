const express = require("express");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.use(requireAdmin);

// Turns a period keyword (or explicit from/to) into a concrete date range.
function getDateRange(period, from, to) {
  const now = new Date();
  if (period === "custom" && from && to) {
    return { start: new Date(from), end: new Date(to) };
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "today") {
    // start is already today at 00:00
  } else if (period === "week") {
    start.setDate(start.getDate() - start.getDay()); // back to Sunday
  } else if (period === "month") {
    start.setDate(1);
  } else if (period === "year") {
    start.setMonth(0, 1);
  }
  return { start, end: now };
}

// GET /api/reports/summary?period=today|week|month|year|custom&from=&to=
// Returns revenue, cost of goods sold, expenses and net profit for the period.
router.get("/summary", async (req, res) => {
  try {
    const { period = "month", from, to } = req.query;
    const { start, end } = getDateRange(period, from, to);
    const dateFilter = { date: { $gte: start, $lte: end } };

    const sales = await Sale.find(dateFilter);
    const expenses = await Expense.find(dateFilter);
    const purchases = await Purchase.find(dateFilter);

    const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const costOfGoodsSold = sales.reduce((sum, s) => sum + s.quantity * (s.costPriceAtSale || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = revenue - costOfGoodsSold - totalExpenses;

    const stockPurchasedCost = purchases.reduce((sum, p) => sum + p.totalCost, 0);
    const unitsSold = sales.reduce((sum, s) => sum + s.quantity, 0);

    // Best-selling products in this period, by units sold
    const byProduct = {};
    sales.forEach(s => {
      if (!byProduct[s.productName]) byProduct[s.productName] = { name: s.productName, units: 0, revenue: 0 };
      byProduct[s.productName].units += s.quantity;
      byProduct[s.productName].revenue += s.totalAmount;
    });
    const topProducts = Object.values(byProduct).sort((a, b) => b.units - a.units).slice(0, 5);

    res.json({
      period, start, end,
      revenue, costOfGoodsSold, totalExpenses, netProfit,
      stockPurchasedCost, unitsSold, salesCount: sales.length,
      topProducts,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/reports/yearly?year=2026 — month-by-month breakdown for charts
router.get("/yearly", async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const months = [];
    for (let m = 0; m < 12; m++) {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0, 23, 59, 59, 999);

      const [sales, expenses] = await Promise.all([
        Sale.find({ date: { $gte: start, $lte: end } }),
        Expense.find({ date: { $gte: start, $lte: end } }),
      ]);

      const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const costOfGoodsSold = sales.reduce((sum, s) => sum + s.quantity * (s.costPriceAtSale || 0), 0);
      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

      months.push({
        month: start.toLocaleString("default", { month: "short" }),
        revenue,
        costOfGoodsSold,
        expenses: totalExpenses,
        netProfit: revenue - costOfGoodsSold - totalExpenses,
      });
    }

    res.json({ year, months });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
