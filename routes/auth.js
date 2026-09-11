const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, admin: { id: admin._id, email: admin.email, name: admin.name } });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/auth/admins — list every admin account. Requires being logged in
// already, so only someone who already has access can see who else has it.
router.get("/admins", requireAdmin, async (req, res) => {
  const admins = await Admin.find().select("-password").sort({ createdAt: 1 });
  res.json(admins);
});

// POST /api/auth/admins — create a new admin login. Requires being logged in
// already — this is what powers the "Add Admin" screen in the dashboard,
// used on presentation day to let the owner set up his own account.
router.post("/admins", requireAdmin, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An admin with this email already exists" });
    }

    const admin = await Admin.create({ email, password, name: name || "Admin" });
    res.status(201).json({ id: admin._id, email: admin.email, name: admin.name });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// DELETE /api/auth/admins/:id — remove an admin login. An admin can't delete
// their own account this way, to avoid accidentally locking everyone out.
router.delete("/admins/:id", requireAdmin, async (req, res) => {
  if (req.params.id === req.admin.id) {
    return res.status(400).json({ error: "You can't remove your own account while logged in as it" });
  }
  const admin = await Admin.findByIdAndDelete(req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  res.json({ message: "Admin removed" });
});

module.exports = router;
