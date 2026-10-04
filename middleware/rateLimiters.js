const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

// Admin sign-ins can arrive through a proxy that makes every visitor look like
// one IP address, so sign-in attempts are counted per ACCOUNT as well as per IP.
const loginKey = (req) => {
  const id = req.body && (req.body.identifier ?? req.body.email);
  return typeof id === "string" && id.trim() ? "acct:" + id.trim().toLowerCase().slice(0, 100) : "ip:" + ipKeyGenerator(req.ip);
};

// NOTE: server.js sets `trust proxy` so these see each visitor's real IP
// (not the hosting proxy's). Without that, everyone shares one counter.

// Applied to POST /api/auth/login only — slows down password guessing
// without affecting normal admin use (10 tries per 15 min is generous
// for a real person, tight for a script).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: loginKey,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Second layer for sign-in: one address trying many different accounts.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied to POST /api/quotes only — a real customer will never hit this,
// a spam script trying to flood the owner's inbox will.
const quoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Broad safety net across the whole API — generous for real use (a busy admin
// session), but stops a script hammering the database.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, loginIpLimiter, quoteLimiter, apiLimiter };
