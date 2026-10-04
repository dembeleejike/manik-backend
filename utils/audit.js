const AuditLog = require("../models/AuditLog");

// Records an action in the activity log. Never throws and never blocks the
// request: a logging problem must not stop real work from happening.
//   audit(req, "sale.delete", "Deleted sale: 2 × Door (₦40,000)")
// For events with no logged-in admin (e.g. the nightly backup), pass null for req.
function audit(req, action, summary) {
  const admin = req && req.admin;
  AuditLog.create({
    admin: admin ? admin.id : undefined,
    adminName: admin ? admin.name || admin.email || admin.phone || "" : "system",
    role: admin ? admin.role : "system",
    action,
    summary: String(summary || "").slice(0, 500),
  }).catch((err) => console.error("Audit log write failed:", err.message));
}

module.exports = { audit };
