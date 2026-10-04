const express = require("express");
const Settings = require("../models/Settings");
const { requireOwner } = require("../middleware/auth");
const { upload, uploadAll } = require("../config/cloudinary");
const { HttpError } = require("../utils/helpers");

const { audit } = require("../utils/audit");
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
  const settings = await getOrCreateSettings();
  res.json(settings);
});

const TEXT_FIELDS = { businessName: 150, tagline: 200, phone: 30, phone2: 30, whatsapp: 30, email: 150, hours: 100, hoursSunday: 100, aboutText: 5000 };
const STAT_FIELDS = ["years", "projects", "quality", "support"];

// Only Google Maps embed links may be saved — the public site renders this
// URL inside an <iframe>, so an arbitrary address would be an injection point.
const MAP_EMBED = /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps)/;

function cleanSettings(body) {
  const out = {};
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string") throw new HttpError(400, `${key} must be text`);
    out[key] = body[key].trim().slice(0, max);
  }
  if (body.stats !== undefined) {
    if (typeof body.stats !== "object" || body.stats === null) throw new HttpError(400, "stats is invalid");
    out.stats = {};
    for (const k of STAT_FIELDS) {
      if (body.stats[k] !== undefined) out.stats[k] = String(body.stats[k]).trim().slice(0, 100);
    }
  }
  if (body.locations !== undefined) {
    if (!Array.isArray(body.locations) || body.locations.length > 10) throw new HttpError(400, "locations must be a list of up to 10");
    out.locations = body.locations.map((loc) => {
      const mapEmbedUrl = typeof loc?.mapEmbedUrl === "string" ? loc.mapEmbedUrl.trim() : "";
      if (mapEmbedUrl && !MAP_EMBED.test(mapEmbedUrl)) {
        throw new HttpError(400, "Map link must be a Google Maps embed link (Share → Embed a map → copy the src URL)");
      }
      return {
        label: String(loc?.label ?? "").trim().slice(0, 100),
        address: String(loc?.address ?? "").trim().slice(0, 300),
        mapEmbedUrl,
      };
    });
  }
  return out;
}

// PUT /api/settings — owner only, updates whichever known fields are sent.
router.put("/", requireOwner, async (req, res) => {
  const settings = await getOrCreateSettings();
  const updates = cleanSettings(req.body);
  Object.assign(settings, updates);
  await settings.save();
  audit(req, "settings.update", `Changed business settings: ${Object.keys(updates).join(", ") || "nothing"}`);
  res.json(settings);
});

// POST /api/settings/hero-image — owner only, uploads the homepage hero
// photo to Cloudinary and saves its URL. Separate from PUT above since
// this one handles a file upload (multipart), not plain JSON.
router.post("/hero-image", requireOwner, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file received" });

  const [url] = await uploadAll([req.file]);
  const settings = await getOrCreateSettings();
  settings.heroImageUrl = url;
  await settings.save();
  res.json(settings);
});

module.exports = router;
