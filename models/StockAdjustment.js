const mongoose = require("mongoose");

// A permanent record of every time a stock number was changed by hand — after a
// physical count (stocktake) or a manual correction — so missing stock is never
// a mystery. Sales and purchases have their own records and aren't listed here.
const stockAdjustmentSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true },
    productRef: { type: String, default: "" },
    before: { type: Number, required: true },
    after: { type: Number, required: true },
    difference: { type: Number, required: true }, // after - before (negative = stock was missing)
    unitCost: { type: Number, default: 0 }, // owner-only: lets the owner see what a shortage cost
    reason: { type: String, enum: ["Stocktake", "Correction"], default: "Stocktake" },
    note: { type: String, default: "", maxlength: 300 },
    batch: { type: String, default: "" }, // groups the lines of one stocktake
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model("StockAdjustment", stockAdjustmentSchema);
