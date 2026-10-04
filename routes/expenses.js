const express = require("express");
const Expense = require("../models/Expense");
const { requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery, parseRangeBound } = require("../utils/dates");
const { HttpError, validateIdParam, requireNumber } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

router.use(requireOwner);

// GET /api/expenses — optionally ?from=&to=
router.get("/", async (req, res) => {
  const expenses = await Expense.find(dateFilterFromQuery(req.query)).sort({ date: -1 });
  res.json(expenses);
});

// POST /api/expenses
router.post("/", async (req, res) => {
  const { category, description, date } = req.body;
  if (!category) throw new HttpError(400, "category and amount are required");
  const amount = requireNumber(req.body.amount, "amount", { min: 0, exclusiveMin: true });

  let expenseDate;
  if (date) {
    expenseDate = parseRangeBound(date, "from");
    if (!expenseDate) throw new HttpError(400, "Invalid date");
  }

  // The category is checked against its allowed list by the Expense model.
  const expense = await Expense.create({
    category, amount, description: typeof description === "string" ? description.trim().slice(0, 500) : "",
    date: expenseDate, recordedBy: req.admin.id,
  });
  audit(req, "expense.create", `Expense: ${expense.category} ₦${Number(expense.amount).toLocaleString("en-NG")}${expense.description ? " — " + expense.description : ""}`);
  res.status(201).json(expense);
});

// DELETE /api/expenses/:id
router.delete("/:id", async (req, res) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) return res.status(404).json({ error: "Expense not found" });
  audit(req, "expense.delete", `Deleted expense: ${expense.category} ₦${Number(expense.amount).toLocaleString("en-NG")}`);
  res.json({ message: "Expense deleted" });
});

module.exports = router;
