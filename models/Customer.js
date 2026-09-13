const mongoose = require("mongoose");

// Purchase history, total spent, and outstanding balance are NOT stored
// here — they're calculated on the fly from the Sale collection, so they
// can never drift out of sync with what actually happened. This model
// only holds profile info that sales don't already capture.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true }, // the matching key across all their sales
    whatsapp: { type: String, default: "" },
    location: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
