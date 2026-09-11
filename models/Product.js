const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ref: { type: String, required: true, unique: true, trim: true }, // e.g. AL-SW-014
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    description: { type: String, default: "" },
    specs: [{ label: String, value: String }], // e.g. { label: "Finish", value: "Powder-coat" }
    colors: [{ type: String }], // hex codes shown as swatches
    status: {
      type: String,
      enum: ["In stock", "Low stock", "Made to order", "Out of stock"],
      default: "In stock",
    },
    images: [{ type: String }], // Cloudinary URLs
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
