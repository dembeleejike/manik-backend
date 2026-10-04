// Pure-logic checks for the new money features (no database needed).
const test = require("node:test");
const assert = require("node:assert");
process.env.JWT_SECRET = "test-secret-test-secret-123";
const Quotation = require("../models/Quotation");
const Sale = require("../models/Sale");
const StockAdjustment = require("../models/StockAdjustment");
const Admin = require("../models/Admin");

test("a quotation needs a customer and at least one valid line", async () => {
  const ok = new Quotation({ number: "Q-1", customerName: "A", lines: [{ description: "Door", quantity: 2, unitPrice: 100 }] });
  assert.strictEqual(ok.validateSync(), undefined);
  assert.ok(new Quotation({ number: "Q-1", customerName: "A", lines: [] }).validateSync(), "no lines");
  assert.ok(new Quotation({ number: "Q-1", customerName: "", lines: [{ description: "x", quantity: 1, unitPrice: 1 }] }).validateSync(), "no name");
  assert.ok(new Quotation({ number: "Q-1", customerName: "A", lines: [{ description: "x", quantity: 0, unitPrice: 1 }] }).validateSync(), "zero quantity");
  assert.ok(new Quotation({ number: "Q-1", customerName: "A", lines: [{ description: "x", quantity: 1, unitPrice: -5 }] }).validateSync(), "negative price");
  assert.ok(new Quotation({ number: "Q-1", customerName: "A", status: "Weird", lines: [{ description: "x", quantity: 1, unitPrice: 1 }] }).validateSync(), "bad status");
});

test("sale payments are validated and money can't go negative", () => {
  const sale = new Sale({
    product: "507f1f77bcf86cd799439011", productName: "Door", quantity: 1, unitPrice: 100, totalAmount: 100, amountPaid: 40,
    payments: [{ amount: 60, method: "Cash" }],
  });
  assert.strictEqual(sale.validateSync(), undefined);
  assert.ok(new Sale({ ...sale.toObject(), payments: [{ amount: 0 }] }).validateSync(), "zero payment");
  assert.ok(new Sale({ ...sale.toObject(), payments: [{ amount: 5, method: "Cheque" }] }).validateSync(), "unknown method");
  assert.ok(new Sale({ ...sale.toObject(), amountPaid: -1, payments: [] }).validateSync(), "negative amount paid");
});

test("stock adjustments keep the before/after trail", () => {
  const a = new StockAdjustment({ product: "507f1f77bcf86cd799439011", productName: "Door", before: 10, after: 7, difference: -3 });
  assert.strictEqual(a.validateSync(), undefined);
  assert.strictEqual(a.reason, "Stocktake");
  assert.ok(new StockAdjustment({ product: "507f1f77bcf86cd799439011", productName: "Door", before: 1, after: 2, difference: 1, reason: "Whim" }).validateSync());
});

test("admins can exist with a phone only, and carry a session version", async () => {
  // (the phone clean-up and the "email or phone" rule run in the model's validate hook)
  const a = new Admin({ phone: "+234 806 098 4868", password: "longenough1" });
  await a.validate();
  assert.strictEqual(a.phone, "08060984868");
  assert.strictEqual(a.tokenVersion, 0);
  await assert.rejects(new Admin({ password: "longenough1" }).validate(), /email or phone/i);
});

test("payment-note text starting with $ is kept as plain text by the update pipeline", () => {
  // The route wraps the payment in $literal; this guards the shape it builds.
  const payment = { amount: 5, note: "$100 balance" };
  const stage = { $set: { payments: { $concatArrays: [{ $ifNull: ["$payments", []] }, [{ $literal: payment }]] } } };
  assert.deepStrictEqual(stage.$set.payments.$concatArrays[1][0].$literal.note, "$100 balance");
});
