const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { effectiveRole, superEmail, SUPER, ADMIN, STAFF } = require("../utils/roles");
const { loginLimiter, loginIpLimiter } = require("../middleware/rateLimiters");
const { normalizePhone, looksLikeEmail } = require("../utils/phone");
const { isId } = require("../utils/helpers");
const { setSessionCookie, clearSessionCookie, SESSION_HOURS } = require("../utils/session");

const { audit } = require("../utils/audit");
const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;

// A real bcrypt hash of a random string, compared against when the account
// doesn't exist, so "unknown user" and "wrong password" take the same time and
// an attacker can't use response timing to discover which logins exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-" + Math.random(), 10);

function signToken(admin) {
  return jwt.sign(
    { id: admin._id, role: admin.role, tv: admin.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h`, algorithm: "HS256" }
  );
}

function publicAdmin(a) {
  return { id: a._id, email: a.email, phone: a.phone, name: a.name, role: effectiveRole(a) };
}

// POST /api/auth/login — body: { identifier, password }. `identifier` is an
// email or a phone number. (`email` is still accepted for older clients.)
router.post("/login", loginIpLimiter, loginLimiter, async (req, res) => {
  const identifier = req.body.identifier ?? req.body.email;
  const { password } = req.body;
  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password) {
    return res.status(400).json({ error: "Email or phone number, and password, are required" });
  }

  const query = looksLikeEmail(identifier)
    ? { email: identifier.trim().toLowerCase() }
    : { phone: normalizePhone(identifier) };
  const masked = identifier.trim().slice(0, 2) + "***";
  if (query.phone === "") return res.status(401).json({ error: "Invalid login details" });

  const admin = await Admin.findOne(query);
  const isMatch = admin ? await admin.comparePassword(password) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!admin || !isMatch) {
    audit(null, "login.failed", `Failed sign-in attempt (${masked})`);
    return res.status(401).json({ error: "Invalid login details" });
  }
  audit({ admin: { id: admin._id, name: admin.name, role: effectiveRole(admin) } }, "login", "Signed in");

  setSessionCookie(req, res, signToken(admin));
  // The token is deliberately NOT returned in the response body — it lives only
  // in the httpOnly cookie, out of reach of any script on the page.
  res.json({ admin: publicAdmin(admin) });
});

// GET /api/auth/me — who is signed in right now (the app calls this on load,
// since it can no longer read the cookie itself)
router.get("/me", requireAdmin, (req, res) => {
  const a = req.admin;
  res.json({ admin: { id: a.id, email: a.email, phone: a.phone, name: a.name, role: a.role } }); // role is already the effective rank
});

// POST /api/auth/logout — clears the session cookie
router.post("/logout", (req, res) => {
  clearSessionCookie(req, res);
  res.json({ message: "Signed out" });
});

// GET /api/auth/admins — lists logins. The super admin is invisible to everyone
// except the super admin themself.
router.get("/admins", requireOwner, async (req, res) => {
  const admins = await Admin.find().select("-password").sort({ createdAt: 1 });
  const out = admins
    .map((a) => ({ ...a.toObject(), role: effectiveRole(a) }))
    .filter((a) => req.admin.isSuper || a.role !== SUPER);
  res.json(out);
});

// POST /api/auth/admins — an admin or the super admin creates a login: "owner"
// (shown as Admin) or "staff". Nobody can create a super admin — that rank belongs
// to the one email in SUPER_ADMIN_EMAIL.
router.post("/admins", requireOwner, async (req, res) => {
  const { email, phone, password, name, role } = req.body;
  const hasEmail = typeof email === "string" && email.trim() !== "";
  const hasPhone = typeof phone === "string" && normalizePhone(phone) !== "";

  if (!hasEmail && !hasPhone) {
    return res.status(400).json({ error: "An email or phone number is required" });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (hasEmail && !/^\S+@\S+\.\S+$/.test(email.trim())) {
    return res.status(400).json({ error: "That email address doesn't look right" });
  }
  if (hasPhone && normalizePhone(phone).length < 10) {
    return res.status(400).json({ error: "That phone number doesn't look right" });
  }

  if (hasEmail && superEmail() && email.trim().toLowerCase() === superEmail()) {
    return res.status(409).json({ error: "An admin with this email or phone number already exists" });
  }
  const duplicate = await Admin.findOne({
    $or: [
      ...(hasEmail ? [{ email: email.trim().toLowerCase() }] : []),
      ...(hasPhone ? [{ phone: normalizePhone(phone) }] : []),
    ],
  });
  if (duplicate) {
    return res.status(409).json({ error: "An admin with this email or phone number already exists" });
  }

  const admin = await Admin.create({
    email: hasEmail ? email.trim() : undefined,
    phone: hasPhone ? phone : undefined,
    password,
    name: (typeof name === "string" && name.trim()) || "Admin",
    role: role === ADMIN ? ADMIN : STAFF,
  });
  audit(req, "admin.create", `Added ${admin.role === ADMIN ? "admin" : "staff"} login: ${admin.name}`);
  res.status(201).json(publicAdmin(admin));
});

// DELETE /api/auth/admins/:id — admins and the super admin can remove admins and
// staff. Nobody can remove the super admin, or their own account.
router.delete("/admins/:id", requireOwner, async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  if (req.params.id === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account while logged in as it" });
  }
  const target = await Admin.findById(req.params.id);
  const targetRole = target ? effectiveRole(target) : null;
  // To anyone but the super admin, the super admin simply doesn't exist.
  if (!target || (targetRole === SUPER && !req.admin.isSuper)) return res.status(404).json({ error: "Admin not found" });
  if (targetRole === SUPER) return res.status(400).json({ error: "The super admin account can't be removed" });
  if (targetRole === ADMIN && !req.admin.isSuper && (await Admin.countDocuments({ role: { $in: [ADMIN, SUPER] } })) <= 1) {
    return res.status(400).json({ error: "You can't remove the last admin account" });
  }
  await target.deleteOne();
  audit(req, "admin.delete", `Removed ${targetRole === ADMIN ? "admin" : "staff"} login: ${target.name}`);
  res.json({ message: "Admin removed" });
});

// PUT /api/auth/admins/:id/role — an admin or the super admin makes someone an
// Admin, or moves an Admin back to staff. Nobody can change the super admin's rank
// or their own (so no one can lock themselves out).
router.put("/admins/:id/role", requireOwner, async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "Invalid id" });
  const role = req.body.role;
  if (role !== ADMIN && role !== STAFF) return res.status(400).json({ error: "Role must be admin or staff" });
  const target = await Admin.findById(req.params.id);
  if (!target || (effectiveRole(target) === SUPER && !req.admin.isSuper)) return res.status(404).json({ error: "Admin not found" });
  if (effectiveRole(target) === SUPER) return res.status(400).json({ error: "The super admin's rank can't be changed" });
  if (String(target._id) === req.admin.id) return res.status(400).json({ error: "You can't change your own rank" });
  target.role = role;
  await target.save();
  audit(req, "admin.role", `${target.name} is now ${role === ADMIN ? "an admin" : "staff"}`);
  res.json(publicAdmin(target));
});

// PUT /api/auth/password — any logged-in admin changes their own password
router.put("/password", requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const admin = await Admin.findById(req.admin.id);
  if (!admin || !(await admin.comparePassword(currentPassword))) {
    // 400, not 401: the dashboard treats any 401 as "session expired" and would sign the person out.
    return res.status(400).json({ error: "Current password is incorrect" });
  }
  admin.password = newPassword;
  admin.tokenVersion = (admin.tokenVersion || 0) + 1; // signs out every other device
  await admin.save();
  setSessionCookie(req, res, signToken(admin)); // keep THIS device signed in
  audit(req, "password.change", "Changed their own password");
  res.json({ message: "Password updated. Other devices have been signed out." });
});

module.exports = router;
