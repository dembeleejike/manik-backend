const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 300 },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // set for stock items; empty for services (e.g. installation)
    quantity: { type: Number, required: true, min: 0.0001 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// A priced offer sent to a customer BEFORE they buy. When they accept, it can be
// converted into real sales (which take stock and record payment).
const quotationSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true }, // Q-2026-0001
    customerName: { type: String, required: true, trim: true, maxlength: 100 },
    customerPhone: { type: String, default: "", trim: true, maxlength: 30 },
    customerLocation: { type: String, default: "", trim: true, maxlength: 300 },
    lines: { type: [lineSchema], validate: [(v) => v.length > 0 && v.length <= 60, "A quotation needs 1 to 60 lines"] },
    discount: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: "", maxlength: 2000 },
    validUntil: { type: Date },
    status: { type: String, enum: ["Draft", "Sent", "Accepted", "Declined", "Converted"], default: "Draft" },
    fromQuote: { type: mongoose.Schema.Types.ObjectId, ref: "Quote" }, // the website enquiry this answers
    sales: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sale" }], // created when converted
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quotation", quotationSchema);
