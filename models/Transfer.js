const mongoose = require("mongoose");

// Stock moved from one location to another (e.g. warehouse -> shop). The total
// on hand never changes; only where it is. Kept permanently as a record.
const transferSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true },
    productRef: { type: String, default: "" },
    categoryName: { type: String, default: "" },
    from: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    fromName: { type: String, required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    toName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    note: { type: String, default: "", maxlength: 300 },
    batch: { type: String, default: "" }, // groups the lines of one multi-product move
    by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Transfer", transferSchema);
