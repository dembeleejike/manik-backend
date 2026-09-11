const rateLimit = require("express-rate-limit");

// Applied to POST /api/auth/login only — slows down password guessing
// without affecting normal admin use (10 tries per 15 min is generous
// for a real person, tight for a script).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again in a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied to POST /api/quotes only — a real customer will never hit this,
// a spam script trying to flood the owner's inbox will.
const quoteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, quoteLimiter };
