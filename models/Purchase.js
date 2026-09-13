const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true }, // snapshot at time of purchase, survives product edits/deletes
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
    totalCost: { type: Number, required: true }, // quantity * unitCost
    supplier: { type: String, default: "" },
    invoiceRef: { type: String, default: "" },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
