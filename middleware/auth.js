const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Stricter than requireAdmin — for financial visibility (Reports, Customers,
// Expenses) and account management (Settings, Admins). Staff accounts can
// use the day-to-day tools (products, quotes, sales, purchases) without
// seeing profit numbers or being able to change business settings.
function requireOwner(req, res, next) {
  requireAdmin(req, res, () => {
    if (req.admin.role !== "owner") {
      return res.status(403).json({ error: "Only an owner account can access this" });
    }
    next();
  });
}

module.exports = { requireAdmin, requireOwner };
