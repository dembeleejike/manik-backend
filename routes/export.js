const express = require("express");
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
const { requireOwner } = require("../middleware/auth");
const { DATASETS, buildFullWorkbook, LAGOS_MS } = require("../utils/datasets");
const { buildWorkbook, buildCsv } = require("../utils/xlsx");
const { sendBackupEmail } = require("../utils/sendEmail");
const Admin = require("../models/Admin");
const { isValidEmail, mailerConfigured } = require("../utils/recipients");
const { backupEmailLimiter } = require("../middleware/rateLimiters");
const { HttpError } = require("../utils/helpers");
const { audit } = require("../utils/audit");

const router = express.Router();

router.use(requireOwner); // exports contain financial and customer data — owner only

const today = () => new Date().toISOString().slice(0, 10);

// Reads every business record into one object — the same shape the nightly
// backup uses, and the shape the restore feature accepts.
async function collectBackup() {
  const [products, categories, sales, purchases, expenses, customers, quotes, projects, quotations, stockAdjustments] = await Promise.all([
    Product.find(), Category.find(), Sale.find(), Purchase.find(),
    Expense.find(), Customer.find(), Quote.find(), Project.find(), Quotation.find(), StockAdjustment.find(),
  ]);
  return { app: "manik", version: 3, exportedAt: new Date(), products, categories, sales, purchases, expenses, customers, quotes, projects, quotations, stockAdjustments };
}

// GET /api/export/backup — the complete backup as a JSON file (the file you
// upload on the Settings page to restore).
router.get("/backup", async (req, res) => {
  const backup = await collectBackup();
  audit(req, "export.backup", "Downloaded a full backup");
  res.setHeader("Content-Disposition", `attachment; filename="manik-backup-${today()}.json"`);
  res.json(backup);
});

// POST /api/export/email-backup — body: { email, password }
// Emails a backup (the .json for restoring + an Excel copy for reading) to the
// address the person types. Because this sends every customer and money record
// out of the system, the person must also re-enter their own password.
router.post("/email-backup", backupEmailLimiter, async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!isValidEmail(email)) throw new HttpError(400, "Enter a valid email address to send the backup to.");
  if (typeof req.body.password !== "string" || !req.body.password) throw new HttpError(400, "Enter your password to confirm it's you.");
  if (!mailerConfigured()) {
    return res.status(503).json({ error: "The system's sending mailbox isn't set up yet. Add EMAIL_USER and EMAIL_APP_PASSWORD in the server settings." });
  }

  // 400 (not 401) on purpose: the dashboard treats a 401 as "session expired" and signs you out.
  const me = await Admin.findById(req.admin.id);
  if (!me || !(await me.comparePassword(req.body.password))) throw new HttpError(400, "That password isn't correct.");

  const backup = await collectBackup();
  const attachments = [
    { filename: `manik-backup-${today()}.json`, content: Buffer.from(JSON.stringify(backup, null, 2)), contentType: "application/json" },
    { filename: `manik-records-${today()}.xlsx`, content: await buildFullWorkbook(), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  ];
  const sent = await sendBackupEmail(attachments, { manual: true, to: email });
  if (!sent) return res.status(502).json({ error: "The email couldn't be sent. Check the sending mailbox settings (app password) on the server." });
  audit(req, "export.email", `Emailed a backup to ${email}`);
  res.json({ message: `Backup emailed to ${email}` });
});

// GET /api/export/:dataset.:format — spreadsheets.
//   dataset: products | sales | purchases | expenses | customers | quotes | quotations | stockcounts | all
//   format:  csv | xlsx   ("all" is xlsx only — one sheet per table)
//   optional ?from=YYYY-MM-DD&to=YYYY-MM-DD for the dated tables
router.get("/:file", async (req, res) => {
  const match = /^(all|products|sales|purchases|expenses|customers|quotes|quotations|stockcounts)\.(csv|xlsx)$/.exec(req.params.file);
  if (!match) return res.status(404).json({ error: "Not found" });
  const [, name, format] = match;

  if (name === "all") {
    if (format !== "xlsx") return res.status(400).json({ error: "The full export is Excel (.xlsx) only" });
    audit(req, "export.spreadsheet", "Exported all records to Excel");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="manik-records-${today()}.xlsx"`);
    return res.send(await buildFullWorkbook());
  }

  const dataset = DATASETS[name];
  const rows = await dataset.load(req.query);
  audit(req, "export.spreadsheet", `Exported ${dataset.title.toLowerCase()} (${format.toUpperCase()}, ${rows.length} rows)`);

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="manik-${name}-${today()}.csv"`);
    return res.send(buildCsv(dataset.columns, rows, { tzOffsetMs: LAGOS_MS }));
  }
  const file = Buffer.from(buildWorkbook([{ name: dataset.title, columns: dataset.columns, rows }], { tzOffsetMs: LAGOS_MS }));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="manik-${name}-${today()}.xlsx"`);
  res.send(file);
});

module.exports = router;
module.exports.collectBackup = collectBackup;
