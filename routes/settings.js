const express = require("express");
const Settings = require("../models/Settings");
const { requireAdmin } = require("../middleware/auth");

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

// PUT /api/settings — admin only, updates whichever fields are sent
router.put("/", requireAdmin, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    Object.assign(settings, req.body);
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
