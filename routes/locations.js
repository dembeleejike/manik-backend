const express = require("express");
const Location = require("../models/Location");
const Product = require("../models/Product");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { listLocations } = require("../utils/locationHelpers");
const { HttpError, validateIdParam } = require("../utils/helpers");
const { audit } = require("../utils/audit");

const router = express.Router();
router.param("id", validateIdParam);

const KINDS = ["shop", "warehouse", "other"];
const cleanName = (v) => (typeof v === "string" ? v.trim().slice(0, 60) : "");

// Makes `loc` the one default for a purpose, un-flagging whichever place had it.
async function makeDefault(loc, flag) {
  await Location.updateMany({ _id: { $ne: loc._id } }, { $set: { [flag]: false } });
  loc[flag] = true;
}

// GET /api/locations — every admin needs the list (for the dropdowns)
router.get("/", requireAdmin, async (req, res) => {
  res.json(await listLocations());
});

// POST /api/locations — owner only
router.post("/", requireOwner, async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) throw new HttpError(400, "Give the location a name, e.g. \"Warehouse 2\"");
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : "other";
  const count = await Location.countDocuments();
  const loc = new Location({ name, kind, sortOrder: count + 1 });
  try {
    if (req.body.isDefaultReceiving === true) await makeDefault(loc, "isDefaultReceiving");
    if (req.body.isDefaultSelling === true) await makeDefault(loc, "isDefaultSelling");
    await loc.save();
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, `There is already a location called ${name}.`);
    throw err;
  }
  audit(req, "location.create", `Added stock location: ${loc.name}`);
  res.status(201).json(loc);
});

// PUT /api/locations/:id — owner only: rename, change type, set as default, switch off/on
router.put("/:id", requireOwner, async (req, res) => {
  const loc = await Location.findById(req.params.id);
  if (!loc) return res.status(404).json({ error: "Location not found" });

  if (req.body.name !== undefined) {
    const name = cleanName(req.body.name);
    if (!name) throw new HttpError(400, "The name can't be empty");
    loc.name = name;
  }
  if (req.body.kind !== undefined && KINDS.includes(req.body.kind)) loc.kind = req.body.kind;

  if (req.body.active === false && loc.active) {
    const holding = await Product.countDocuments({ stock: { $elemMatch: { location: loc._id, quantity: { $gt: 0 } } } });
    if (holding > 0) throw new HttpError(400, `${loc.name} still holds stock for ${holding} product${holding === 1 ? "" : "s"}. Move it elsewhere first.`);
    if (loc.isDefaultReceiving || loc.isDefaultSelling) throw new HttpError(400, `${loc.name} is a default location. Make another location the default first.`);
    if ((await Location.countDocuments({ active: true })) <= 1) throw new HttpError(400, "You need at least one active location.");
    loc.active = false;
  } else if (req.body.active === true) {
    loc.active = true;
  }

  if (req.body.isDefaultReceiving === true) { if (!loc.active) throw new HttpError(400, "Switch the location on first."); await makeDefault(loc, "isDefaultReceiving"); }
  if (req.body.isDefaultSelling === true) { if (!loc.active) throw new HttpError(400, "Switch the location on first."); await makeDefault(loc, "isDefaultSelling"); }

  try {
    await loc.save();
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, `There is already a location called ${loc.name}.`);
    throw err;
  }
  audit(req, "location.update", `Changed stock location: ${loc.name}`);
  res.json(loc);
});

module.exports = router;
