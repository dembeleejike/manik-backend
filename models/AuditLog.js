const mongoose = require("mongoose");

// A permanent, append-only record of important actions (who did what, when).
// It exists for documentation and accountability: if a sale disappears or a
// price changes, the owner can see who did it. It deliberately stores short
// summaries only — no phone numbers, passwords or other private details.
const auditLogSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    adminName: { type: String, default: "" },
    role: { type: String, default: "" },
    action: { type: String, required: true, index: true }, // e.g. "sale.delete"
    summary: { type: String, default: "", maxlength: 500 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
