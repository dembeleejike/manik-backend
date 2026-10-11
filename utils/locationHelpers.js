const Location = require("../models/Location");
const { HttpError, isId } = require("./helpers");

// First run: create the two places most shops have, so the app works immediately.
async function ensureDefaultLocations() {
  if ((await Location.countDocuments()) > 0) return;
  try {
    await Location.create([
      { name: "Shop", kind: "shop", isDefaultSelling: true, sortOrder: 1 },
      { name: "Warehouse", kind: "warehouse", isDefaultReceiving: true, sortOrder: 2 },
    ]);
  } catch (err) {
    if (err.code !== 11000) throw err; // someone else created them at the same moment — fine
  }
}

async function listLocations({ activeOnly = false } = {}) {
  await ensureDefaultLocations();
  return Location.find(activeOnly ? { active: true } : {}).sort({ sortOrder: 1, name: 1 });
}

// purpose: "selling" (sales) or "receiving" (purchases / new stock)
async function defaultLocation(purpose) {
  await ensureDefaultLocations();
  const flag = purpose === "receiving" ? "isDefaultReceiving" : "isDefaultSelling";
  return (await Location.findOne({ [flag]: true, active: true })) || (await Location.findOne({ active: true }).sort({ sortOrder: 1, name: 1 }));
}

// The location a request names, or the default for that purpose when none is named.
async function resolveLocation(id, purpose) {
  if (id === undefined || id === null || id === "") {
    const loc = await defaultLocation(purpose);
    if (!loc) throw new HttpError(400, "No active stock location exists. Add one in Business Settings.");
    return loc;
  }
  if (!isId(String(id))) throw new HttpError(400, "Invalid stock location");
  const loc = await Location.findById(id);
  if (!loc) throw new HttpError(400, "That stock location doesn't exist");
  if (!loc.active) throw new HttpError(400, `${loc.name} is switched off. Choose another location.`);
  return loc;
}

module.exports = { ensureDefaultLocations, listLocations, defaultLocation, resolveLocation };
