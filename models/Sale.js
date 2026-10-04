const mongoose = require("mongoose");

// A payment received AFTER the sale was recorded (a customer paying off a balance).
const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ["Cash", "Bank Transfer", "POS", "Other"], default: "Cash" },
    date: { type: Date, default: Date.now },
    note: { type: String, default: "", maxlength: 300 },
    fromQuotation: { type: mongoose.Schema.Types.ObjectId, ref: "Quotation" }, // set when created by converting a quotation
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: false }
);

const saleSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true }, // snapshot at time of sale, survives product edits/deletes
    quantity: { type: Number, required: true, min: 0.0001 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true }, // quantity * unitPrice
    costPriceAtSale: { type: Number, default: 0 }, // snapshot of product.costPrice, used for profit reports
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["Paid", "Partial", "Unpaid"], default: "Paid" },
    amountPaid: { type: Number, default: 0, min: 0 }, // everything received so far: paid at the sale + later payments
    payments: { type: [paymentSchema], default: [] }, // later payments only (the first payment is just amountPaid at the time of the sale)
    paymentMethod: { type: String, enum: ["Cash", "Bank Transfer", "POS", "Other"], default: "Cash" },
    date: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
    fromQuote: { type: mongoose.Schema.Types.ObjectId, ref: "Quote" }, // set when the sale closes out a quote
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
