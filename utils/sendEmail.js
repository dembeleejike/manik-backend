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

module.exports = { sendQuoteNotification };
