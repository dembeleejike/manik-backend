const express = require("express");
const Quote = require("../models/Quote");
const { requireAdmin } = require("../middleware/auth");
const { sendQuoteNotification } = require("../utils/sendEmail");
const { quoteLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

// POST /api/quotes — public, this is what the site's quote form submits to
router.post("/", quoteLimiter, async (req, res) => {
  try {
    const { requestType, name, phone, product, quantity, location, notes, preferredContact } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone are required" });
    }
    if (requestType === "Material" && !product) {
      return res.status(400).json({ error: "Please specify which product you need" });
    }

    const quote = await Quote.create({ requestType, name, phone, product, quantity, location, notes, preferredContact });

    // Fire the email notification but don't make the customer wait for it
    sendQuoteNotification(quote);

    res.status(201).json({ message: "Quote request received", quote });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
});

// GET /api/quotes — admin only, the "inbox"
router.get("/", requireAdmin, async (req, res) => {
  const quotes = await Quote.find().sort({ createdAt: -1 });
  res.json(quotes);
});

// PUT /api/quotes/:id — admin only, update status (New / Contacted / Closed)
router.put("/:id", requireAdmin, async (req, res) => {
  const { status } = req.body;
  const quote = await Quote.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  res.json(quote);
});

// DELETE /api/quotes/:id — admin only
router.delete("/:id", requireAdmin, async (req, res) => {
  const quote = await Quote.findByIdAndDelete(req.params.id);
  if (!quote) return res.status(404).json({ error: "Quote not found" });
  res.json({ message: "Quote deleted" });
});

module.exports = router;
