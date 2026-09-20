const express = require("express");
const Product = require("../models/Product");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Expense = require("../models/Expense");
const Customer = require("../models/Customer");
const Quote = require("../models/Quote");
const Category = require("../models/Category");
const Project = require("../models/Project");
const { uploadRawBuffer } = require("../config/cloudinary");
const { sendBackupEmail } = require("../utils/sendEmail");

const router = express.Router();

// This endpoint is called automatically by a scheduled GitHub Action, not by
// a logged-in person — so it can't use the normal login-token check. Instead
// it checks a long secret value that only your GitHub Action knows, sent as
// a header. Without the correct secret, this endpoint refuses the request.
function requireBackupSecret(req, res, next) {
  const provided = req.headers["x-backup-secret"];
  if (!provided || provided !== process.env.BACKUP_SECRET) {
    return res.status(401).json({ error: "Invalid or missing backup secret" });
  }
  next();
}

// POST /api/backup/run — generates a full backup, stores it in Cloudinary,
// and emails a copy to the owner. Two independent safety copies from one run.
router.post("/run", requireBackupSecret, async (req, res) => {
  try {
    const [products, categories, sales, purchases, expenses, customers, quotes, projects] = await Promise.all([
      Product.find(), Category.find(), Sale.find(), Purchase.find(),
      Expense.find(), Customer.find(), Quote.find(), Project.find(),
    ]);

    const backup = {
      exportedAt: new Date(),
      products, categories, sales, purchases, expenses, customers, quotes, projects,
    };
    const jsonBuffer = Buffer.from(JSON.stringify(backup, null, 2));
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `manik-backup-${dateStr}`;

    // Upload to Cloudinary and email a copy — if either one fails, still try
    // the other rather than losing both safety copies over one glitch.
    const results = await Promise.allSettled([
      uploadRawBuffer(jsonBuffer, filename),
      sendBackupEmail(jsonBuffer, `${filename}.json`),
    ]);

    const cloudinaryFailed = results[0].status === "rejected";
    if (cloudinaryFailed) console.error("Backup Cloudinary upload failed:", results[0].reason?.message);

    res.json({
      message: "Backup complete",
      cloudinaryUrl: cloudinaryFailed ? null : results[0].value,
      emailSent: results[1].status === "fulfilled",
    });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

module.exports = router;
