// Run this ONCE after deploying the role-based access update, to promote
// an existing admin account to "owner" — accounts created before roles
// existed would otherwise default to "staff" (limited access).
//
// Usage: node promoteToOwner.js <email-or-phone>

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const { normalizePhone, looksLikeEmail } = require("./utils/phone");

const identifier = process.argv[2];

async function run() {
  if (!identifier) {
    console.error("Usage: node promoteToOwner.js <email-or-phone>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const query = looksLikeEmail(identifier)
    ? { email: identifier.toLowerCase() }
    : { phone: normalizePhone(identifier) };
  const admin = await Admin.findOne(query);
  if (!admin) {
    console.log(`No admin found for ${identifier}`);
    process.exit(1);
  }

  admin.role = "owner";
  await admin.save();
  console.log(`${identifier} is now an owner — full access restored.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
