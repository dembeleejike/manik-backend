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
    quantity: { type: Number, default: 0 }, // real stock count — updated automatically by purchases/sales
    lowStockThreshold: { type: Number, default: 5 }, // below this, status can be flagged Low stock
    costPrice: { type: Number, default: 0 }, // what MANIK pays per unit — used for stock value & profit calculations
    sellingPrice: { type: Number, default: 0 }, // default selling price — can be overridden per sale
    images: [{ type: String }], // Cloudinary URLs
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
