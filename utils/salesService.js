// The one place a sale is recorded, used by the Sales screen AND by converting a
// quotation into sales — so stock, payment and customer rules can never differ.
const Sale = require("../models/Sale");
const Product = require("../models/Product");
const Quote = require("../models/Quote");
const Customer = require("../models/Customer");
const { sendLowStockAlert } = require("./sendEmail");
const { normalizePhone } = require("./phone");
const { parseRangeBound } = require("./dates");
const { HttpError, requireNumber, computeStatus, isId } = require("./helpers");

const PAYMENT_STATUSES = ["Paid", "Partial", "Unpaid"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "POS", "Other"];

// input: { product, quantity, unitPrice, customerName, customerPhone, paymentStatus,
//          amountPaid, paymentMethod, date, notes, fromQuote, fromQuotation }
// Returns { sale, product } (product = the updated product document).
async function recordSale(input, adminId) {
  const { product, customerName, customerPhone, paymentStatus, amountPaid, paymentMethod, date, notes, fromQuote, fromQuotation } = input;

  if (!isId(String(product))) throw new HttpError(400, "A valid product is required");
  const quantity = requireNumber(input.quantity, "quantity", { min: 0, exclusiveMin: true });
  const unitPrice = requireNumber(input.unitPrice, "unitPrice", { min: 0 });
  if (paymentStatus !== undefined && !PAYMENT_STATUSES.includes(paymentStatus)) throw new HttpError(400, "Invalid payment status");
  if (paymentMethod !== undefined && !PAYMENT_METHODS.includes(paymentMethod)) throw new HttpError(400, "Invalid payment method");
  if (fromQuote && !isId(String(fromQuote))) throw new HttpError(400, "Invalid quote");

  let saleDate;
  if (date) {
    saleDate = parseRangeBound(date, "from");
    if (!saleDate) throw new HttpError(400, "Invalid date");
  }

  const totalAmount = Math.round(quantity * unitPrice * 100) / 100;
  const status = paymentStatus || "Paid";
  // Paid with no explicit amount means the full amount was paid; Unpaid is
  // always 0; Partial must be somewhere in between. This keeps the
  // outstanding-balance math (totalAmount - amountPaid) correct everywhere.
  let resolvedAmountPaid;
  if (status === "Unpaid") resolvedAmountPaid = 0;
  else if (amountPaid != null && amountPaid !== "") resolvedAmountPaid = requireNumber(amountPaid, "amountPaid", { min: 0 });
  else resolvedAmountPaid = status === "Paid" ? totalAmount : 0;
  if (resolvedAmountPaid > totalAmount + 0.005) throw new HttpError(400, "Amount paid can't be more than the total");

  // Take the stock first, atomically: the filter only matches if enough stock
  // is still there, so two simultaneous sales can never oversell the same units.
  const before = await Product.findById(product);
  if (!before) throw new HttpError(404, "Product not found");

  const updated = await Product.findOneAndUpdate(
    { _id: product, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity } },
    { new: true }
  );
  if (!updated) throw new HttpError(400, `Not enough stock of ${before.name} — only ${before.quantity} available`);

  let sale;
  try {
    sale = await Sale.create({
      product, productName: updated.name, quantity, unitPrice, totalAmount,
      costPriceAtSale: updated.costPrice, customerName: customerName || "", customerPhone: normalizePhone(customerPhone),
      paymentStatus: status, amountPaid: resolvedAmountPaid, paymentMethod, date: saleDate, notes, fromQuote: fromQuote || undefined,
      fromQuotation: fromQuotation || undefined, recordedBy: adminId,
    });
  } catch (err) {
    // The sale couldn't be recorded — give the stock back rather than lose it.
    await Product.updateOne({ _id: product }, { $inc: { quantity } });
    throw err;
  }

  const newStatus = computeStatus(updated);
  if (newStatus !== updated.status) {
    updated.status = newStatus;
    await updated.save();
  }

  if (fromQuote) await Quote.findByIdAndUpdate(fromQuote, { status: "Closed" });

  // Auto-create the customer record so purchase history is trackable without
  // a separate manual step. The name is only set when first created, so a
  // name the owner corrected later isn't overwritten by the next sale.
  const phone = normalizePhone(customerPhone);
  if (phone) {
    await Customer.findOneAndUpdate(
      { phone },
      { $setOnInsert: { phone, name: customerName || "Customer" } },
      { upsert: true, new: true }
    );
  }

  if (before.quantity > before.lowStockThreshold && updated.quantity <= updated.lowStockThreshold) {
    sendLowStockAlert(updated); // fire-and-forget
  }

  return { sale, product: updated };
}

module.exports = { recordSale, PAYMENT_STATUSES, PAYMENT_METHODS };
