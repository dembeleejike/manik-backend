const mongoose = require("mongoose");

// Makes user-supplied text safe to use inside a $regex.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Makes user-supplied text safe to drop into HTML (emails).
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// An Error that the global handler turns into a clean 4xx response.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isId = (v) => typeof v === "string" && mongoose.Types.ObjectId.isValid(v) && String(new mongoose.Types.ObjectId(v)) === v;

// Express param middleware: rejects malformed :id values with a 400 instead of
// letting Mongoose throw a CastError.
function validateIdParam(req, res, next, value) {
  if (!isId(value)) return res.status(400).json({ error: "Invalid id" });
  next();
}

// Parses a JSON string field from a multipart form, or throws a 400.
function parseJsonField(value, fieldName, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, `${fieldName} is not valid JSON`);
  }
}

// Returns Number(value) if it is a finite number >= min, otherwise throws a 400.
function requireNumber(value, fieldName, { min = 0, exclusiveMin = false } = {}) {
  const n = Number(value);
  if (value === "" || value == null || !Number.isFinite(n) || n < min || (exclusiveMin && n === min)) {
    throw new HttpError(400, `${fieldName} must be a number${exclusiveMin ? " greater than" : " of at least"} ${min}`);
  }
  return n;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// Single place that decides a product's stock status from its quantity, so
// sales, purchases and their deletions can never disagree. "Made to order"
// is a manual choice by the owner and is never overwritten automatically.
function computeStatus(product) {
  if (product.status === "Made to order") return "Made to order";
  if (product.quantity <= 0) return "Out of stock";
  if (product.quantity <= product.lowStockThreshold) return "Low stock";
  return "In stock";
}

module.exports = { escapeRegex, escapeHtml, HttpError, isId, validateIdParam, parseJsonField, requireNumber, pick, computeStatus };
