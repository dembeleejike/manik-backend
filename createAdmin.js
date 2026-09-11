// Run this ONCE to create the owner's admin login: node createAdmin.js
// Edit the email/password below first, then delete this file afterward
// (or at least remove the password) so it's not sitting in your repo.

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");

const EMAIL = "owner@manik.com"; // TODO: real login email
const PASSWORD = "changeme123"; // TODO: real password — change this before running
const NAME = "MANIK Admin";

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await Admin.findOne({ email: EMAIL.toLowerCase() });
  if (existing) {
    console.log("An admin with this email already exists. No changes made.");
    process.exit(0);
  }

  await Admin.create({ email: EMAIL, password: PASSWORD, name: NAME });
  console.log(`Admin created: ${EMAIL}`);
  console.log("You can now log in at POST /api/auth/login with this email and password.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
});
