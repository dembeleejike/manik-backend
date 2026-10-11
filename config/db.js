const mongoose = require("mongoose");

async function connectDB() {
  // The automated tests start the real server without a database; they set this
  // so the server never tries (and later gives up and exits) mid-test.
  if (process.env.MANIK_SKIP_DB === "1") return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");
    try {
      const r = await require("../utils/superAdminSync").syncSuperAdmin();
      if (r.reason) console.warn("Super admin not set up — add SUPER_ADMIN_EMAIL in the server settings.");
      else if (!r.found) console.warn("SUPER_ADMIN_EMAIL is set, but no login with that email exists yet. Create it (npm run create-admin) or add it.");
      else if (r.changed) console.log("Super admin rank applied.");
    } catch (e) { console.error("Super admin sync failed:", e.message); }
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
