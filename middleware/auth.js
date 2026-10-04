const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const { COOKIE_NAME, parseCookies } = require("../utils/session");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The sign-in token normally arrives in the httpOnly session cookie. A
// "Bearer" header is still accepted for scripts and API tools.
function readToken(req) {
  const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (cookie) return { token: cookie, viaCookie: true };
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return { token: header.split(" ")[1], viaCookie: false };
  return { token: null, viaCookie: false };
}

// Verifies the token AND re-checks the admin account in the database, so a
// removed admin loses access immediately and a demoted owner can't keep using
// an old "owner" token. The role used is the one currently stored.
async function loadAdmin(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  const admin = await Admin.findById(decoded.id).select("email phone role name tokenVersion");
  if (!admin) return null;
  if ((decoded.tv ?? -1) !== (admin.tokenVersion || 0)) return null; // signed out everywhere (e.g. password changed)
  return { id: String(admin._id), email: admin.email, phone: admin.phone, role: admin.role, name: admin.name };
}

async function requireAdmin(req, res, next) {
  const { token, viaCookie } = readToken(req);
  if (!token) return res.status(401).json({ error: "Please sign in" });

  // Cookies are attached by the browser automatically, so a state-changing
  // request that relies on one must also carry a custom header. A forged form
  // or image on another website cannot add that header.
  if (viaCookie && !SAFE_METHODS.has(req.method) && !req.headers["x-manik-csrf"]) {
    return res.status(403).json({ error: "Request blocked for your safety. Reload the page and try again." });
  }

  let admin;
  try {
    admin = await loadAdmin(token);
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError" || err.name === "NotBeforeError") {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    return next(err); // genuine server/database problem — don't report it as a bad login
  }
  if (!admin) return res.status(401).json({ error: "Your session has expired. Please sign in again." });

  req.admin = admin; // { id, email, phone, role, name }
  next(); // outside the try, so a downstream error is never mistaken for a login failure
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

// For public routes that show more to a logged-in admin (e.g. cost prices).
// Never rejects: no/invalid token simply means "treat as a public visitor".
async function optionalAdmin(req, res, next) {
  const { token } = readToken(req);
  if (token) {
    try {
      req.admin = (await loadAdmin(token)) || undefined;
    } catch {
      req.admin = undefined;
    }
  }
  next();
}

module.exports = { requireAdmin, requireOwner, optionalAdmin };
