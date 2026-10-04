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
const { HttpError, isId } = require("../utils/helpers");
const { audit } = require("../utils/audit");
const { sendBackupEmail } = require("../utils/sendEmail");
const { collectBackup } = require("./export");

const router = express.Router();

// Order matters only for readability of the report; restores are independent
// per table. (Admin logins are deliberately NOT part of backups or restores.)
const TABLES = [
  ["categories", Category, "Categories"],
  ["products", Product, "Products"],
  ["sales", Sale, "Sales"],
  ["purchases", Purchase, "Purchases"],
  ["expenses", Expense, "Expenses"],
  ["customers", Customer, "Customers"],
  ["quotes", Quote, "Quote requests"],
  ["projects", Project, "Projects"],
  ["quotations", Quotation, "Quotations"],
  ["stockAdjustments", StockAdjustment, "Stock counts"],
];
const MAX_PER_TABLE = 100000;

// Checks every record against the real schema. Bad records are skipped (and
// counted) rather than letting one broken row block the whole restore.
async function prepare(Model, rawList) {
  const good = [];
  let invalid = 0;
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object" || !isId(String(raw._id))) { invalid++; continue; }
    const { __v, ...fields } = raw;
    const doc = new Model(fields);
    try {
      await doc.validate(); // also runs the model's own clean-up (e.g. phone formatting)
    } catch {
      invalid++;
      continue;
    }
    good.push(doc.toObject());
  }
  return { good, invalid };
}

// POST /api/restore — owner only. Body: { backup: <contents of a backup .json>, dryRun?: boolean }
//
// MERGE restore: every record in the file is put back (matched by its id —
// updated if it exists, re-created if it was deleted). Records created AFTER
// the backup was taken are left alone, so a restore can never erase newer work.
// With dryRun the server only reports what WOULD change.
router.post("/", requireOwner, async (req, res) => {
  const backup = req.body && req.body.backup;
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new HttpError(400, "That doesn't look like a MANIK backup file.");
  }
  const known = TABLES.filter(([key]) => Array.isArray(backup[key]));
  if (known.length === 0) throw new HttpError(400, "That file has no MANIK records in it. Use a backup (.json) downloaded from MANIK.");
  for (const [key] of known) {
    if (backup[key].length > MAX_PER_TABLE) throw new HttpError(400, `Too many ${key} in one file.`);
  }

  const prepared = [];
  for (const [key, Model, label] of known) {
    prepared.push({ key, Model, label, ...(await prepare(Model, backup[key])) });
  }

  // What would happen: how many already exist (will be updated) vs. are missing (will be re-created).
  const plan = [];
  for (const p of prepared) {
    const ids = p.good.map((d) => d._id);
    const existing = ids.length ? await p.Model.countDocuments({ _id: { $in: ids } }) : 0;
    plan.push({ table: p.label, inFile: p.good.length + p.invalid, restorable: p.good.length, willUpdate: existing, willAdd: p.good.length - existing, skipped: p.invalid });
  }

  if (req.body.dryRun) {
    return res.json({ dryRun: true, exportedAt: backup.exportedAt || null, plan });
  }

  // Safety net first: email the owner a copy of the CURRENT data, so even a
  // mistaken restore can itself be undone. Best effort — never blocks the restore.
  let safetyCopyEmailed = false;
  if (process.env.OWNER_EMAIL && process.env.EMAIL_USER) {
    try {
      const current = await collectBackup();
      safetyCopyEmailed = await sendBackupEmail(
        [{ filename: `manik-before-restore-${new Date().toISOString().slice(0, 10)}.json`, content: Buffer.from(JSON.stringify(current)), contentType: "application/json" }],
        { manual: true }
      );
    } catch (err) {
      console.error("Pre-restore safety email failed:", err.message);
    }
  }

  for (const p of prepared) {
    if (p.good.length === 0) continue;
    const ops = p.good.map((doc) => ({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } }));
    // Process in slices so a large restore never builds one enormous request.
    for (let i = 0; i < ops.length; i += 1000) {
      try {
        await p.Model.bulkWrite(ops.slice(i, i + 1000), { ordered: false, timestamps: false });
      } catch (err) {
        // A record can clash with a newer one that now uses the same unique value
        // (e.g. a product reference reused after the original was deleted). Skip
        // just those records and keep going, rather than failing half-way.
        const clashes = err.writeErrors ? err.writeErrors.length : 0;
        if (!clashes) throw err;
        p.conflicts = (p.conflicts || 0) + clashes;
      }
    }
  }
  for (const t of plan) {
    const p = prepared.find((x) => x.label === t.table);
    if (p && p.conflicts) { t.skipped += p.conflicts; t.restorable -= p.conflicts; t.conflicts = p.conflicts; }
  }

  const total = plan.reduce((n, t) => n + t.restorable, 0);
  audit(req, "restore", `Restored ${total} records from a backup dated ${backup.exportedAt ? String(backup.exportedAt).slice(0, 10) : "unknown"}`);
  const clashed = plan.reduce((n, t) => n + (t.conflicts || 0), 0);
  res.json({
    message: `Restored ${total} records.` + (clashed ? ` ${clashed} could not be restored because a newer record already uses the same reference or phone number.` : ""),
    safetyCopyEmailed, plan,
  });
});

module.exports = router;
module.exports._prepare = prepare;
