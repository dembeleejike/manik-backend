const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["Transportation", "Staff", "Shop", "Electricity", "Repairs", "Stock Purchase", "Delivery", "Other"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    date: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
