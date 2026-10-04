const express = require("express");
const AuditLog = require("../models/AuditLog");
const { requireOwner } = require("../middleware/auth");
const { dateFilterFromQuery } = require("../utils/dates");
const { escapeRegex } = require("../utils/helpers");

const router = express.Router();
router.use(requireOwner); // the activity log is for the owner only

// GET /api/audit — newest first. Optional: ?q=text&action=sale&from=&to=&limit=
router.get("/", async (req, res) => {
  const filter = {};
  const range = dateFilterFromQuery(req.query);
  if (range.date) filter.at = range.date;
  if (typeof req.query.action === "string" && req.query.action) {
    filter.action = { $regex: "^" + escapeRegex(req.query.action.slice(0, 40)) };
  }
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = escapeRegex(req.query.q.trim().slice(0, 100));
    filter.$or = [{ summary: { $regex: term, $options: "i" } }, { adminName: { $regex: term, $options: "i" } }, { action: { $regex: term, $options: "i" } }];
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);
  const logs = await AuditLog.find(filter).sort({ at: -1 }).limit(limit);
  res.json(logs);
});

module.exports = router;
