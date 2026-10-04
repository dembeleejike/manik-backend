const test = require("node:test");
const assert = require("node:assert");
process.env.JWT_SECRET = "test-secret-test-secret-123";
const { normalizePhone } = require("../utils/phone");
const dates = require("../utils/dates");
const h = require("../utils/helpers");

test("phone numbers normalise to one format", () => {
  for (const x of ["0806 098 4868", "+234 806 098 4868", "2348060984868", "8060984868", "(0806) 098-4868", "002348060984868"]) {
    assert.strictEqual(normalizePhone(x), "08060984868", x);
  }
  assert.strictEqual(normalizePhone(""), "");
});

test("date ranges follow Nigerian time and include the whole 'to' day", () => {
  assert.strictEqual(dates.startOfLagosDay(new Date("2026-10-01T23:30:00Z")).toISOString(), "2026-10-01T23:00:00.000Z");
  assert.strictEqual(dates.parseRangeBound("2026-10-02", "from").toISOString(), "2026-10-01T23:00:00.000Z");
  assert.strictEqual(dates.parseRangeBound("2026-10-02", "to").toISOString(), "2026-10-02T22:59:59.999Z");
  assert.strictEqual(dates.parseRangeBound("garbage", "to"), null);
  assert.deepStrictEqual(dates.dateFilterFromQuery({}), {});
});

test("stock status is computed in one place", () => {
  assert.strictEqual(h.computeStatus({ status: "In stock", quantity: 0, lowStockThreshold: 5 }), "Out of stock");
  assert.strictEqual(h.computeStatus({ status: "In stock", quantity: 5, lowStockThreshold: 5 }), "Low stock");
  assert.strictEqual(h.computeStatus({ status: "Low stock", quantity: 6, lowStockThreshold: 5 }), "In stock");
  assert.strictEqual(h.computeStatus({ status: "Made to order", quantity: 0, lowStockThreshold: 5 }), "Made to order");
});

test("validation and escaping helpers", () => {
  assert.strictEqual(h.escapeHtml("<img onerror=x>&\""), "&lt;img onerror=x&gt;&amp;&quot;");
  assert.strictEqual(h.escapeRegex("a.b(c)"), "a\\.b\\(c\\)");
  assert.throws(() => h.requireNumber("-1", "q"), /must be/);
  assert.throws(() => h.requireNumber("0", "q", { exclusiveMin: true }), /must be/);
  assert.strictEqual(h.requireNumber("2.5", "q"), 2.5);
  assert.throws(() => h.parseJsonField("{bad", "colors", []), /not valid JSON/);
  assert.ok(h.isId("507f1f77bcf86cd799439011"));
  assert.ok(!h.isId("abc"));
});
