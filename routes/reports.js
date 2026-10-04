const express = require("express");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const { requireOwner } = require("../middleware/auth");
const { LAGOS_TZ, startOfLagosDay, endOfLagosDay, parseRangeBound } = require("../utils/dates");
const { HttpError } = require("../utils/helpers");

const router = express.Router();

router.use(requireOwner);

// Turns a period keyword (or explicit from/to) into a concrete date range,
// measured in Nigerian time rather than the server's UTC clock.
function getDateRange(period, from, to) {
  const now = new Date();
  if (period === "custom") {
    const start = parseRangeBound(from, "from");
    const end = parseRangeBound(to, "to");
    if (!start || !end) throw new HttpError(400, "A valid from and to date are required for a custom range");
    if (start > end) throw new HttpError(400, "The from date must be before the to date");
    return { start, end };
  }
  let start = startOfLagosDay(now);
  if (period === "today") {
    // already today at 00:00 Lagos time
  } else if (period === "week") {
    const lagosDay = new Date(now.getTime() + 60 * 60 * 1000).getUTCDay(); // 0 = Sunday
    start = new Date(start.getTime() - lagosDay * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    const l = new Date(now.getTime() + 60 * 60 * 1000);
    start = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - 60 * 60 * 1000);
  } else if (period === "year") {
    const l = new Date(now.getTime() + 60 * 60 * 1000);
    start = new Date(Date.UTC(l.getUTCFullYear(), 0, 1) - 60 * 60 * 1000);
  } else {
    throw new HttpError(400, "period must be today, week, month, year or custom");
  }
  return { start, end: now };
}

const sum = (field) => ({ $sum: field });
const cogsExpr = { $multiply: ["$quantity", { $ifNull: ["$costPriceAtSale", 0] }] };

// GET /api/reports/summary?period=today|week|month|year|custom&from=&to=
// Returns revenue, cost of goods sold, expenses and net profit for the period.
router.get("/summary", async (req, res) => {
  const { period = "month", from, to } = req.query;
  const { start, end } = getDateRange(period, from, to);
  const dateFilter = { date: { $gte: start, $lte: end } };

  // The database does the adding-up, so this stays fast however many sales exist.
  const [salesAgg, expenseAgg, purchaseAgg, topProducts] = await Promise.all([
    Sale.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, revenue: sum("$totalAmount"), costOfGoodsSold: sum(cogsExpr), unitsSold: sum("$quantity"), salesCount: sum(1) } },
    ]),
    Expense.aggregate([{ $match: dateFilter }, { $group: { _id: null, total: sum("$amount") } }]),
    Purchase.aggregate([{ $match: dateFilter }, { $group: { _id: null, total: sum("$totalCost") } }]),
    Sale.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$productName", units: sum("$quantity"), revenue: sum("$totalAmount") } },
      { $sort: { units: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: "$_id", units: 1, revenue: 1 } },
    ]),
  ]);

  const s = salesAgg[0] || { revenue: 0, costOfGoodsSold: 0, unitsSold: 0, salesCount: 0 };
  const totalExpenses = expenseAgg[0]?.total || 0;

  res.json({
    period, start, end,
    revenue: s.revenue, costOfGoodsSold: s.costOfGoodsSold, totalExpenses,
    netProfit: s.revenue - s.costOfGoodsSold - totalExpenses,
    stockPurchasedCost: purchaseAgg[0]?.total || 0,
    unitsSold: s.unitsSold, salesCount: s.salesCount,
    topProducts,
  });
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// GET /api/reports/yearly?year=2026 — month-by-month breakdown for charts
router.get("/yearly", async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  if (year < 2000 || year > 2100) throw new HttpError(400, "Invalid year");

  const start = new Date(Date.UTC(year, 0, 1) - 60 * 60 * 1000); // Jan 1, 00:00 Lagos
  const end = new Date(Date.UTC(year + 1, 0, 1) - 60 * 60 * 1000 - 1);
  const range = { date: { $gte: start, $lte: end } };
  const monthOf = { $month: { date: "$date", timezone: LAGOS_TZ } };

  // Two queries for the whole year (instead of 24 one-month queries).
  const [salesByMonth, expensesByMonth] = await Promise.all([
    Sale.aggregate([{ $match: range }, { $group: { _id: monthOf, revenue: sum("$totalAmount"), costOfGoodsSold: sum(cogsExpr) } }]),
    Expense.aggregate([{ $match: range }, { $group: { _id: monthOf, total: sum("$amount") } }]),
  ]);

  const salesMap = Object.fromEntries(salesByMonth.map((r) => [r._id, r]));
  const expMap = Object.fromEntries(expensesByMonth.map((r) => [r._id, r.total]));

  const months = MONTHS.map((month, i) => {
    const revenue = salesMap[i + 1]?.revenue || 0;
    const costOfGoodsSold = salesMap[i + 1]?.costOfGoodsSold || 0;
    const expenses = expMap[i + 1] || 0;
    return { month, revenue, costOfGoodsSold, expenses, netProfit: revenue - costOfGoodsSold - expenses };
  });

  res.json({ year, months });
});

module.exports = router;
