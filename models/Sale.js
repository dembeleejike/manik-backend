const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true }, // quantity * unitPrice, calculated server-side
    costPriceAtSale: { type: Number, default: 0 }, // snapshot of product's cost price at time of sale — needed for accurate profit history even if cost changes later
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["Paid", "Partial", "Unpaid"], default: "Paid" },
    amountPaid: { type: Number, default: 0 }, // relevant when status is Partial or Unpaid
    paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "POS", "Other"], default: "Cash" },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    fromQuote: { type: mongoose.Schema.Types.ObjectId, ref: "Quote" }, // set when converted from a quote request
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
