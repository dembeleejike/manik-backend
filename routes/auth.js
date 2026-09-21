const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { requireAdmin, requireOwner } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

// POST /api/auth/login — "identifier" can be an email OR a phone number,
// since not every admin has an email address.
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/phone and password are required" });
    }

    const cleaned = identifier.trim().toLowerCase();
    const admin = await Admin.findOne({
      $or: [{ email: cleaned }, { phone: identifier.trim() }],
    });
    if (!admin) {
      return res.status(401).json({ error: "Invalid login or password" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid login or password" });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      admin: { id: admin._id, email: admin.email, phone: admin.phone, name: admin.name, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/auth/admins — owner only, lists every admin account
router.get("/admins", requireOwner, async (req, res) => {
  const admins = await Admin.find().select("-password").sort({ createdAt: 1 });
  res.json(admins);
});

// POST /api/auth/admins — owner only, creates a new login with a chosen
// role. Needs EITHER an email OR a phone number, not necessarily both —
// for admins who don't have an email address.
router.post("/admins", requireOwner, async (req, res) => {
  try {
    const { email, phone, password, name, role } = req.body;
    if (!email && !phone) {
      return res.status(400).json({ error: "An email or phone number is required" });
    }
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const orConditions = [];
    if (email) orConditions.push({ email: email.toLowerCase() });
    if (phone) orConditions.push({ phone: phone.trim() });
    const existing = await Admin.findOne({ $or: orConditions });
    if (existing) {
      return res.status(409).json({ error: "An admin with this email or phone already exists" });
    }

    const admin = await Admin.create({
      email: email || undefined,
      phone: phone || undefined,
      password, name: name || "Admin",
      role: role === "owner" ? "owner" : "staff",
    });
    res.status(201).json({ id: admin._id, email: admin.email, phone: admin.phone, name: admin.name, role: admin.role });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/auth/admins/:id — owner only. An admin can't delete their own
// account this way, to avoid accidentally locking everyone out.
router.delete("/admins/:id", requireOwner, async (req, res) => {
  if (req.params.id === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account while logged in as it" });
  }
  const admin = await Admin.findByIdAndDelete(req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  res.json({ message: "Admin removed" });
});

module.exports = router;
