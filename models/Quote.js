const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    product: { type: String, required: true }, // product name as text, kept simple for the owner to read
    quantity: { type: String, default: "" },
    notes: { type: String, default: "" },
    preferredContact: { type: String, enum: ["WhatsApp", "Phone call", "Email"], default: "WhatsApp" },
    status: { type: String, enum: ["New", "Contacted", "Closed"], default: "New" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quote", quoteSchema);
