const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true }, // optional — either this or phone is required
    phone: { type: String, unique: true, sparse: true, trim: true }, // for admins without an email address
    password: { type: String, required: true }, // stored hashed, never plain text
    name: { type: String, default: "Admin" },
    role: { type: String, enum: ["owner", "staff"], default: "staff" }, // owner sees financials/settings, staff handles day-to-day
  },
  { timestamps: true }
);

// At least one of email or phone must be set — that's how they'll log in.
adminSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    return next(new Error("An admin needs either an email or a phone number to log in with"));
  }
  next();
});

// Hash the password automatically whenever it's set or changed
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
