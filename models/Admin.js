const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { normalizePhone } = require("../utils/phone");

const adminSchema = new mongoose.Schema(
  {
    // An admin signs in with an email OR a phone number. At least one is
    // required (see validate below). "sparse" lets many admins have no email
    // (or no phone) without tripping the unique index on the empty value.
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true }, // stored normalized, e.g. 08060984868
    password: { type: String, required: true }, // stored hashed, never plain text
    name: { type: String, default: "Admin", trim: true, maxlength: 100 },
    role: { type: String, enum: ["superadmin", "owner", "staff"], default: "staff" }, // superadmin = the one business owner; "owner" is shown as Admin; staff handles day-to-day
    tokenVersion: { type: Number, default: 0 }, // bumping this signs the person out of every device (used on password change)
  },
  { timestamps: true }
);

// Treat empty strings as "not provided" so sparse unique indexes work, and
// keep phones in one canonical format so login matching is reliable.
adminSchema.pre("validate", function (next) {
  if (!this.email) this.email = undefined;
  if (this.phone) this.phone = normalizePhone(this.phone);
  if (!this.phone) this.phone = undefined;
  if (!this.email && !this.phone) {
    this.invalidate("email", "An email or phone number is required");
  }
  next();
});

// Hash the password automatically whenever it's set or changed
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Only ONE super admin can ever exist (the database refuses a second).
adminSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "superadmin" } });

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
