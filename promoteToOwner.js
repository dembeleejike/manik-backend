// Run this ONCE after deploying the role-based access update, to promote
// an existing admin account to "owner" — accounts default to "staff"
// (limited access). Works whether the account uses an email or a phone
// number to log in.
//
// Usage: node promoteToOwner.js youremail@example.com
//    or: node promoteToOwner.js 08012345678

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");

const identifier = process.argv[2];

async function run() {
  if (!identifier) {
    console.error("Usage: node promoteToOwner.js <email-or-phone>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const cleaned = identifier.trim();
  const admin = await Admin.findOne({
    $or: [{ email: cleaned.toLowerCase() }, { phone: cleaned }],
  });
  if (!admin) {
    console.log(`No admin found matching ${identifier}`);
    process.exit(1);
  }

  admin.role = "owner";
  await admin.save();
  console.log(`${admin.email || admin.phone} is now an owner — full access restored.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
