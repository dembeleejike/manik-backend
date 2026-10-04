const express = require("express");
const crypto = require("crypto");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Customer = require("../models/Customer");
const Quote = require("../models/Quote");
const Category = require("../models/Category");
const Project = require("../models/Project");
const Quotation = require("../models/Quotation");
const StockAdjustment = require("../models/StockAdjustment");
const { uploadRawBuffer } = require("../config/cloudinary");
const { sendBackupEmail } = require("../utils/sendEmail");
const { buildFullWorkbook } = require("../utils/datasets");
const { audit } = require("../utils/audit");

const router = express.Router();

// This endpoint is called automatically by a scheduled GitHub Action, not by
// a logged-in person — so it can't use the normal login-token check. Instead
// it checks a long secret value that only your GitHub Action knows, sent as
// a header. Without the correct secret, this endpoint refuses the request.
function requireBackupSecret(req, res, next) {
  const expected = process.env.BACKUP_SECRET;
  if (!expected || expected.length < 16) {
    return res.status(503).json({ error: "Backups are not configured on this server" });
  }
  const provided = String(req.headers["x-backup-secret"] || "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Constant-time comparison so the secret can't be guessed from response timing.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Invalid or missing backup secret" });
  }
  next();
}

// POST /api/backup/run — generates a full backup, stores it privately in
// Cloudinary, and emails a copy to the owner. Two independent safety copies
// from one run.
router.post("/run", requireBackupSecret, async (req, res) => {
  const [products, categories, sales, purchases, expenses, customers, quotes, projects, quotations, stockAdjustments] = await Promise.all([
    Product.find(), Category.find(), Sale.find(), Purchase.find(),
    Expense.find(), Customer.find(), Quote.find(), Project.find(), Quotation.find(), StockAdjustment.find(),
  ]);

  const backup = {
    app: "manik", version: 3,
    exportedAt: new Date(),
    products, categories, sales, purchases, expenses, customers, quotes, projects, quotations, stockAdjustments,
  };
  const jsonBuffer = Buffer.from(JSON.stringify(backup, null, 2));
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `manik-backup-${dateStr}-${crypto.randomBytes(6).toString("hex")}`;

  // Upload to Cloudinary and email a copy — if either one fails, still try
  // the other rather than losing both safety copies over one glitch.
  const results = await Promise.allSettled([
    uploadRawBuffer(jsonBuffer, filename),
    buildFullWorkbook().then((xlsx) =>
      sendBackupEmail([
        { filename: `manik-backup-${dateStr}.json`, content: jsonBuffer, contentType: "application/json" },
        { filename: `manik-records-${dateStr}.xlsx`, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ])
    ),
  ]);
  audit(null, "backup.nightly", "Nightly backup ran");

  const cloudinaryFailed = results[0].status === "rejected";
  if (cloudinaryFailed) console.error("Backup Cloudinary upload failed:", results[0].reason?.message);

  // The stored file is private, and its link is deliberately NOT returned:
  // this response ends up in the GitHub Action's logs.
  res.json({
    message: "Backup complete",
    cloudinaryStored: !cloudinaryFailed,
    emailSent: results[1].status === "fulfilled" && results[1].value !== false,
  });
});

module.exports = router;
