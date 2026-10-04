const nodemailer = require("nodemailer");
const { escapeHtml: esc } = require("./helpers");
const { ownerEmails, mailerConfigured } = require("./recipients");

// Works with Gmail (using an App Password, not your normal password) or
// any SMTP provider — just change the "service" / host settings below
// to match whatever you actually set up in your .env file.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

async function sendQuoteNotification(quote) {
  const html = `
    <h2>New quote request — MANIK</h2>
    <p><strong>Request type:</strong> ${esc(quote.requestType || "Material")}</p>
    <p><strong>Name:</strong> ${esc(quote.name)}</p>
    <p><strong>Phone:</strong> ${esc(quote.phone)}</p>
    <p><strong>Product:</strong> ${esc(quote.product || "—")}</p>
    <p><strong>Quantity:</strong> ${esc(quote.quantity || "—")}</p>
    <p><strong>Location:</strong> ${esc(quote.location || "—")}</p>
    <p><strong>Notes:</strong> ${esc(quote.notes || "—")}</p>
    <p><strong>Preferred contact:</strong> ${esc(quote.preferredContact)}</p>
    <hr/>
    <p>Log in to the admin dashboard to view and respond.</p>
  `;

  try {
    const to = await ownerEmails(); // every owner account's email (+ the optional OWNER_EMAIL extra)
    if (!to.length || !mailerConfigured()) return console.warn("Quote notification not emailed: no owner email or no sending mailbox is set up.");
    await transporter.sendMail({
      from: `"MANIK Website" <${process.env.EMAIL_USER}>`,
      to,
      subject: `New quote request from ${String(quote.name).replace(/[\r\n]+/g, " ")}`,
      html,
    });
  } catch (err) {
    // Don't crash the request just because email failed — log it and move on.
    // The quote is already saved in the database either way.
    console.error("Failed to send quote notification email:", err.message);
  }
}

async function sendLowStockAlert(product) {
  const html = `
    <h2>Low stock alert — MANIK</h2>
    <p><strong>${esc(product.name)}</strong> (${esc(product.ref)}) is down to <strong>${esc(product.quantity)}</strong> units — at or below the threshold of ${esc(product.lowStockThreshold)}.</p>
    <p>Consider restocking soon.</p>
  `;
  try {
    const to = await ownerEmails();
    if (!to.length || !mailerConfigured()) return console.warn("Low-stock alert not emailed: no owner email or no sending mailbox is set up.");
    await transporter.sendMail({
      from: `"MANIK System" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Low stock: ${String(product.name).replace(/[\r\n]+/g, " ")}`,
      html,
    });
  } catch (err) {
    console.error("Failed to send low stock alert email:", err.message);
  }
}

// attachments: [{ filename, content (Buffer), contentType }]. Returns true if sent.
// `to`: one address or a list; when omitted the backup goes to every owner account.
async function sendBackupEmail(attachments, { manual = false, to } = {}) {
  try {
    const recipients = to ? [].concat(to) : await ownerEmails();
    if (!recipients.length || !mailerConfigured()) {
      console.warn("Backup not emailed: no recipient or no sending mailbox is set up.");
      return false;
    }
    await transporter.sendMail({
      from: `"MANIK System" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: `MANIK ${manual ? "backup you requested" : "daily backup"} — ${new Date().toISOString().slice(0, 10)}`,
      text:
        "Your MANIK backup is attached.\n\n" +
        "• The .json file is the complete backup — it is what you upload on the Settings page to restore.\n" +
        "• The .xlsx file opens in Excel / Google Sheets so you can read your sales, purchases, expenses and customers.\n\n" +
        "This email contains private business and customer information. Keep it safe and don't forward it.",
      attachments,
    });
  } catch (err) {
    console.error("Failed to send backup email:", err.message);
    return false;
  }
  return true;
}

module.exports = { sendQuoteNotification, sendLowStockAlert, sendBackupEmail };
