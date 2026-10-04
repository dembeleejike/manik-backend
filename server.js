require("dotenv").config();
require("./utils/asyncErrors"); // must load before any routes — see file for why
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { apiLimiter } = require("./middleware/rateLimiters");
const { requireOwner } = require("./middleware/auth");

// Fail fast on a missing or weak signing secret rather than running with
// tokens that anyone could forge.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("JWT_SECRET is missing or too short (use at least 16 random characters). Refusing to start.");
  process.exit(1);
}

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const quoteRoutes = require("./routes/quotes");
const projectRoutes = require("./routes/projects");
const settingsRoutes = require("./routes/settings");
const purchaseRoutes = require("./routes/purchases");
const saleRoutes = require("./routes/sales");
const expenseRoutes = require("./routes/expenses");
const reportRoutes = require("./routes/reports");
const customerRoutes = require("./routes/customers");
const exportRoutes = require("./routes/export");
const backupRoutes = require("./routes/backup");
const restoreRoutes = require("./routes/restore");
const quotationRoutes = require("./routes/quotations");
const stocktakeRoutes = require("./routes/stocktake");
const auditRoutes = require("./routes/audit");

const app = express();

// The API runs behind a hosting proxy (Render etc.). Trusting one hop makes
// req.ip the real visitor, which the rate limiters depend on.
// Number of proxy hops in front of the app (hosting proxy = 1; hosting proxy behind
// a Vercel /api rewrite = 2). Set TRUST_PROXY in the environment to change it.
app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
app.disable("x-powered-by");

connectDB();

// CORS: set CORS_ORIGINS to a comma-separated list of the site + admin URLs,
// e.g. https://manik.com,https://admin.manik.com . Requests with no Origin
// (the backup GitHub Action, curl, server-to-server) are unaffected.
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
if (allowedOrigins.length === 0) {
  console.warn("WARNING: CORS_ORIGINS is not set — allowing requests from any website. Set it in production.");
}
// Cookies are only ever allowed to travel with requests from the explicitly
// listed origins; an unlisted site gets no CORS permission at all.
app.use(
  cors((req, cb) => {
    const origin = req.headers.origin;
    const listed = !!origin && allowedOrigins.includes(origin);
    const open = !origin || allowedOrigins.length === 0; // no CORS_ORIGINS set: dev mode, no cookies shared
    cb(null, { origin: listed || open, credentials: listed });
  })
);

// Basic hardening headers (no extra dependency needed for an API-only server).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// A restore uploads a whole backup file, so it needs a much larger body limit —
// but it is only parsed after the caller is verified as an owner, so strangers
// can't push big payloads at the server. Everything else stays at 100kb.
app.use("/api/restore", requireOwner, express.json({ limit: "40mb" }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => res.json({ status: "MANIK API is running" }));

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/restore", restoreRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/stocktake", stocktakeRoutes);
app.use("/api/audit", auditRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Catch-all error handler — turns known problems into clean 4xx answers and
// keeps a single bad request from crashing (or leaking details from) the server.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.name === "MulterError") {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 5MB)" : err.message;
    return res.status(400).json({ error: message });
  }
  if (err.message && err.message.startsWith("Only JPG, PNG or WEBP")) {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || "Invalid data" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Invalid value for " + err.path });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "That value already exists" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large" });
  }

  console.error(err.stack || err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MANIK API running on port ${PORT}`);
  require("./utils/keepAlive").start(); // stops the free host from putting the API to sleep
});
