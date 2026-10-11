// Makes the database agree with SUPER_ADMIN_EMAIL at startup: that account becomes
// the one super admin; any other super admin is demoted to a normal admin.
const Admin = require("../models/Admin");
const { SUPER, ADMIN, superEmail } = require("./roles");

async function syncSuperAdmin() {
  const s = superEmail();
  if (!s) return { changed: false, reason: "SUPER_ADMIN_EMAIL not set" };
  let changed = false;
  const demoted = await Admin.updateMany({ role: SUPER, email: { $ne: s } }, { $set: { role: ADMIN } });
  if (demoted.modifiedCount) changed = true;
  const promoted = await Admin.updateOne({ email: s, role: { $ne: SUPER } }, { $set: { role: SUPER } });
  if (promoted.modifiedCount) changed = true;
  const exists = await Admin.exists({ email: s });
  return { changed, found: !!exists };
}

module.exports = { syncSuperAdmin };
