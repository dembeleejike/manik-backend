const express = require("express");
const Settings = require("../models/Settings");
const { requireOwner } = require("../middleware/auth");
const { upload, uploadAll } = require("../config/cloudinary");

const router = express.Router();

// Ensures the one settings document exists, creating it with defaults
// the first time anyone asks for it.
async function getOrCreateSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({
      businessName: "MANIK GLOBAL TRUST LTD.",
      tagline: "General Trading and Marketing",
      phone: "08060984868",
      phone2: "07026110486",
      whatsapp: "2348060984868",
      locations: [
        { label: "Head Office", address: "No. 23 Ifelodun Street, Dopemu, Agege, Lagos" },
        { label: "Branch Office", address: "Block 2, Shop No. 6, Aluminium Village, Kaduna/Lokoja Express Road, Dumez, Abuja" },
        { label: "Gauraka Branch", address: "Gauraka, Niger State" },
      ],
    });
  }
  return settings;
}

// GET /api/settings — public, the frontend reads business info from here
router.get("/", async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// PUT /api/settings — owner only, updates whichever fields are sent.
// (Previously requireAdmin — tightened so staff accounts genuinely can't
// change business settings via the API, not just hidden from them in the UI.)
router.put("/", requireOwner, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    Object.assign(settings, req.body);
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// POST /api/settings/hero-image — owner only, uploads the homepage hero
// photo to Cloudinary and saves its URL. Separate from PUT above since
// this one handles a file upload (multipart), not plain JSON.
router.post("/hero-image", requireOwner, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file received" });

    const [url] = await uploadAll([req.file]);
    const settings = await getOrCreateSettings();
    settings.heroImageUrl = url;
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
