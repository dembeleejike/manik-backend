const nodemailer = require("nodemailer");

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
    <p><strong>Request type:</strong> ${quote.requestType || "Material"}</p>
    <p><strong>Name:</strong> ${quote.name}</p>
    <p><strong>Phone:</strong> ${quote.phone}</p>
    <p><strong>Product:</strong> ${quote.product || "—"}</p>
    <p><strong>Quantity:</strong> ${quote.quantity || "—"}</p>
    <p><strong>Location:</strong> ${quote.location || "—"}</p>
    <p><strong>Notes:</strong> ${quote.notes || "—"}</p>
    <p><strong>Preferred contact:</strong> ${quote.preferredContact}</p>
    <hr/>
    <p>Log in to the admin dashboard to view and respond.</p>
  `;

  try {
    await transporter.sendMail({
      from: `"MANIK Website" <${process.env.EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL, // the business owner's real inbox
      subject: `New quote request from ${quote.name}`,
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
    <p><strong>${product.name}</strong> (${product.ref}) is down to <strong>${product.quantity}</strong> units — at or below the threshold of ${product.lowStockThreshold}.</p>
    <p>Consider restocking soon.</p>
  `;
  try {
    await transporter.sendMail({
      from: `"MANIK System" <${process.env.EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `Low stock: ${product.name}`,
      html,
    });
  } catch (err) {
    console.error("Failed to send low stock alert email:", err.message);
  }
}

async function sendBackupEmail(jsonBuffer, filename) {
  try {
    await transporter.sendMail({
      from: `"MANIK System" <${process.env.EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `MANIK backup — ${new Date().toLocaleDateString()}`,
      text: "Your automatic daily backup is attached. Keep this email as a second safety copy alongside the one stored in Cloudinary.",
      attachments: [{ filename, content: jsonBuffer, contentType: "application/json" }],
    });
  } catch (err) {
    console.error("Failed to send backup email:", err.message);
  }
}

module.exports = { sendQuoteNotification, sendLowStockAlert, sendBackupEmail };
