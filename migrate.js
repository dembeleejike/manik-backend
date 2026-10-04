// One-time (and safe to re-run) upgrade for data created before this update:
//
//   node migrate.js
//
// 1. Rebuilds the Admin indexes so email AND phone logins work (the old email
//    index didn't allow admins without an email).
// 2. Puts every phone number in one canonical format (08060984868), so the
//    same customer is no longer split in two by "0806..." vs "+234806...".
// 3. Merges any duplicate customer records that this reveals.
// 4. Recalculates every product's stock status from its quantity.

require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("./models/Admin");
const Customer = require("./models/Customer");
const Sale = require("./models/Sale");
const Product = require("./models/Product");
const { normalizePhone } = require("./utils/phone");
const { computeStatus } = require("./utils/helpers");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  // 1. Admin indexes
  await Admin.syncIndexes();
  console.log("Admin indexes rebuilt.");

  // 1b. Admin phone numbers: logins created by an earlier version may have the phone
  // saved exactly as typed ("+234 806 098 4868"). Sign-in looks phones up in the
  // standard format (08060984868), so put them all in that format.
  let adminsFixed = 0;
  const seenAdminPhones = new Map();
  for (const a of await Admin.find({ phone: { $exists: true, $ne: null } }).sort({ createdAt: 1 })) {
    const n = normalizePhone(a.phone);
    if (!n) continue;
    if (seenAdminPhones.has(n)) {
      console.warn(`WARNING: two admins share the phone number ${n} (${seenAdminPhones.get(n)} and ${a.name}). Remove one from the Admins page.`);
      continue;
    }
    seenAdminPhones.set(n, a.name);
    if (n !== a.phone) {
      await Admin.updateOne({ _id: a._id }, { phone: n }); // direct update: leaves the password untouched
      adminsFixed++;
    }
  }
  console.log(`Admin phone numbers standardised: ${adminsFixed}`);

  // 2. Sales phones
  let salesFixed = 0;
  for (const sale of await Sale.find({ customerPhone: { $ne: "" } })) {
    const n = normalizePhone(sale.customerPhone);
    if (n !== sale.customerPhone) {
      await Sale.updateOne({ _id: sale._id }, { customerPhone: n });
      salesFixed++;
    }
  }
  console.log(`Sales phone numbers standardised: ${salesFixed}`);

  // 3. Customers: standardise, merging duplicates into the oldest record
  const byPhone = new Map();
  let merged = 0, customersFixed = 0;
  for (const c of await Customer.find().sort({ createdAt: 1 })) {
    const n = normalizePhone(c.phone);
    if (!n) continue;
    const keep = byPhone.get(n);
    if (keep) {
      // fill any blanks on the kept record from the duplicate, then drop it
      for (const f of ["whatsapp", "location", "notes"]) if (!keep[f] && c[f]) keep[f] = c[f];
      await keep.save();
      await c.deleteOne();
      merged++;
    } else {
      if (n !== c.phone) {
        c.phone = n;
        await c.save();
        customersFixed++;
      }
      byPhone.set(n, c);
    }
  }
  console.log(`Customer phone numbers standardised: ${customersFixed}, duplicates merged: ${merged}`);

  // 4. Product stock status
  let statusFixed = 0;
  for (const p of await Product.find()) {
    const s = computeStatus(p);
    if (s !== p.status) {
      p.status = s;
      await p.save();
      statusFixed++;
    }
  }
  console.log(`Product statuses corrected: ${statusFixed}`);

  console.log("Migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
