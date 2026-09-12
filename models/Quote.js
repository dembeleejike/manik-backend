const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    requestType: {
      type: String,
      enum: ["Material", "Fabrication", "Installation", "Delivery", "Full project"],
      default: "Material",
    },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    product: { type: String, default: "" }, // optional now — a "Full project" request may not name one product
    quantity: { type: String, default: "" },
    location: { type: String, default: "" }, // where the work/delivery is needed
    notes: { type: String, default: "" },
    preferredContact: { type: String, enum: ["WhatsApp", "Phone call", "Email"], default: "WhatsApp" },
    status: { type: String, enum: ["New", "Contacted", "Closed"], default: "New" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quote", quoteSchema);
