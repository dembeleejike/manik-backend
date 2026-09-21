const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true }, // snapshot — stays correct even if product is later renamed/deleted
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true }, // quantity * unitCost, calculated server-side
    supplier: { type: String, default: "" },
    invoiceRef: { type: String, default: "" },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
