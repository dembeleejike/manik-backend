const mongoose = require("mongoose");

// A place stock can be kept: the shop, the warehouse, a branch…
// Stock is tracked per location, so the system always knows what is where.
const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
    kind: { type: String, enum: ["shop", "warehouse", "other"], default: "other" },
    active: { type: Boolean, default: true }, // a location with no stock can be switched off
    isDefaultReceiving: { type: Boolean, default: false }, // where new purchases go by default (the warehouse)
    isDefaultSelling: { type: Boolean, default: false }, // where sales are taken from by default (the shop)
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Location", locationSchema);
