const express = require("express");
const Expense = require("../models/Expense");
const { requireOwner } = require("../middleware/auth");

const router = express.Router();

router.use(requireOwner);

// GET /api/expenses — optionally ?from=&to=
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  const expenses = await Expense.find(filter).sort({ date: -1 });
  res.json(expenses);
});

// POST /api/expenses
router.post("/", async (req, res) => {
  try {
    const { category, amount, description, date } = req.body;
    if (!category || amount == null) {
      return res.status(400).json({ error: "category and amount are required" });
    }
    const expense = await Expense.create({ category, amount, description, date, recordedBy: req.admin.id });
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  res.json({ message: "Expense deleted" });
});

module.exports = router;
