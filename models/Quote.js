const mongoose = require("mongoose");

const quoteSchema = new mongoose.Schema(
  {
    requestType: {
      type: String,
      enum: ["Material", "Fabrication", "Installation", "Delivery", "Full project"],
      default: "Material",
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    product: { type: String, default: "", trim: true, maxlength: 200 }, // optional now — a "Full project" request may not name one product
    quantity: { type: String, default: "", trim: true, maxlength: 100 },
    location: { type: String, default: "", trim: true, maxlength: 300 }, // where the work/delivery is needed
    notes: { type: String, default: "", trim: true, maxlength: 2000 },
    preferredContact: { type: String, enum: ["WhatsApp", "Phone call", "Email"], default: "WhatsApp" },
    status: { type: String, enum: ["New", "Contacted", "Closed"], default: "New" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quote", quoteSchema);
