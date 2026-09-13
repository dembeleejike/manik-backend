const mongoose = require("mongoose");

// This is a singleton — only one Settings document will ever exist.
// It holds everything about the business that used to be hardcoded
// into the frontend, so the owner can update it without touching code.
const settingsSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: "MANIK GLOBAL TRUST LTD." },
    tagline: { type: String, default: "General Trading and Marketing" },
    phone: { type: String, default: "" },
    phone2: { type: String, default: "" }, // the business has two contact lines
    whatsapp: { type: String, default: "" },
    email: { type: String, default: "" },
    locations: [{ label: { type: String }, address: { type: String } }], // multiple offices/branches
    hours: { type: String, default: "Mon – Sat, 8am – 6pm" },
    hoursSunday: { type: String, default: "Closed" },
    aboutText: { type: String, default: "" },
    mapEmbedUrl: { type: String, default: "" }, // Google Maps embed iframe URL
    heroImageUrl: { type: String, default: "" }, // homepage hero photo
    stats: {
      years: { type: String, default: "" },
      projects: { type: String, default: "" },
      quality: { type: String, default: "" },
      support: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
