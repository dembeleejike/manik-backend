// Who system emails (backups, new-quote alerts, low-stock alerts) are sent to.
// It is based on the owners' own accounts: every OWNER account that has an email
// address receives them. OWNER_EMAIL in the server settings is now just an
// optional EXTRA address (comma-separated list allowed), e.g. a shared inbox.
const Admin = require("../models/Admin");

const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
const isValidEmail = (v) => typeof v === "string" && v.length <= 200 && EMAIL_RE.test(v.trim());

// The mailbox the system SENDS from (the Gmail account + app password in the
// server settings). This can't come from a person: something has to log in to
// a mailbox to send. People only choose where the email is delivered.
const mailerConfigured = () => !!(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD);

async function ownerEmails() {
  const found = new Set();
  try {
    const owners = await Admin.find({ role: "owner", email: { $exists: true, $nin: [null, ""] } }).select("email");
    for (const o of owners) if (isValidEmail(o.email)) found.add(o.email.trim().toLowerCase());
  } catch (err) {
    console.error("Couldn't read owner emails:", err.message);
  }
  for (const extra of String(process.env.OWNER_EMAIL || "").split(/[,;]/)) {
    if (isValidEmail(extra)) found.add(extra.trim().toLowerCase());
  }
  return [...found];
}

module.exports = { ownerEmails, isValidEmail, mailerConfigured };
