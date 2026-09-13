// Run this ONCE after deploying the role-based access update, to promote
// your existing admin account(s) to "owner" — they'd otherwise default to
// "staff" (limited access) since they were created before roles existed.
//
// Usage: node promoteToOwner.js youremail@example.com

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");

const email = process.argv[2];

async function run() {
  if (!email) {
    console.error("Usage: node promoteToOwner.js youremail@example.com");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const admin = await Admin.findOne({ email: email.toLowerCase() });
  if (!admin) {
    console.log(`No admin found with email ${email}`);
    process.exit(1);
  }

  admin.role = "owner";
  await admin.save();
  console.log(`${email} is now an owner — full access restored.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
