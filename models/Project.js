const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: { type: String, required: true },
    tag: { type: String, default: "" }, // e.g. "Windows & doors"
    images: [{ type: String }], // Cloudinary URLs
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", projectSchema);
