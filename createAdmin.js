// Creates the first owner login. Run it ONCE, passing the details on the
// command line so no password is ever written into a file in the repo:
//
//   node createAdmin.js <email-or-phone> <password> "<Name>"
//
// Example: node createAdmin.js owner@example.com "a-long-passphrase" "Mr Manik"

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const { normalizePhone, looksLikeEmail } = require("./utils/phone");

const [identifier, password, name = "MANIK Admin"] = process.argv.slice(2);

async function run() {
  if (!identifier || !password) {
    console.error('Usage: node createAdmin.js <email-or-phone> <password> "<Name>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (["changeme123", "password", "12345678"].includes(password.toLowerCase())) {
    console.error("That password is too easy to guess. Choose another.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const isEmail = looksLikeEmail(identifier);
  const query = isEmail ? { email: identifier.toLowerCase() } : { phone: normalizePhone(identifier) };
  if (await Admin.findOne(query)) {
    console.log("An admin with this email/phone already exists. No changes made.");
    process.exit(0);
  }

  await Admin.create({
    ...(isEmail ? { email: identifier } : { phone: identifier }),
    password,
    name,
    role: "owner",
  });
  console.log(`Owner account created for ${identifier}. Sign in at the admin dashboard.`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
});
