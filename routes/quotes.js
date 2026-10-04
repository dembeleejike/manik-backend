const express = require("express");
const Quote = require("../models/Quote");
const { requireAdmin } = require("../middleware/auth");
const { sendQuoteNotification } = require("../utils/sendEmail");
const { quoteLimiter } = require("../middleware/rateLimiters");
const { validateIdParam } = require("../utils/helpers");

const { audit } = require("../utils/audit");
const router = express.Router();
router.param("id", validateIdParam);

const text = (v) => (typeof v === "string" ? v : "");

// POST /api/quotes — public, this is what the site's quote form submits to
router.post("/", quoteLimiter, async (req, res) => {
  const { requestType, name, phone, product, quantity, location, notes, preferredContact, website } = req.body;

  // Honeypot: real visitors never see or fill the hidden "website" field,
  // bots usually do. Pretend it worked so the bot doesn't adapt.
  if (website) return res.status(201).json({ message: "Quote request received" });

  if (!text(name).trim() || !text(phone).trim()) {
    return res.status(400).json({ error: "Name and phone are required" });
  }
  if (requestType === "Material" && !text(product).trim()) {
    return res.status(400).json({ error: "Please specify which product you need" });
  }

  // Mongoose validates requestType / preferredContact against their allowed
  // values and enforces the length limits; a bad value becomes a clean 400.
  const quote = await Quote.create({
    requestType, name: text(name), phone: text(phone), product: text(product), quantity: text(quantity),
    location: text(location), notes: text(notes), preferredContact,
  });

  // Fire the email notification but don't make the customer wait for it
  sendQuoteNotification(quote);

  // Don't echo the stored record back to the public — they only need to know it worked.
  res.status(201).json({ message: "Quote request received" });
});

// GET /api/quotes — admin only, the "inbox"
router.get("/", requireAdmin, async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 });
  res.json(quotes);
});

// PUT /api/quotes/:id — admin only, update status (New / Contacted / Closed)
router.put("/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!["New", "Contacted", "Closed"].includes(status)) {
    return res.status(400).json({ error: "Status must be New, Contacted or Closed" });
  }
  const quote = await Quote.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  res.json(quote);
});

// DELETE /api/quotes/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const quote = await Quote.findByIdAndDelete(req.params.id);
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  audit(req, "quote.delete", `Deleted quote request from ${quote.name}`);
  res.json({ message: "Quote deleted" });
});

module.exports = router;
