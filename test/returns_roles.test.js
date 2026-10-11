const test = require("node:test");
const assert = require("node:assert/strict");
const { planReturn } = require("../utils/returns");
const roles = require("../utils/roles");

const sale = (o = {}) => ({ quantity: 10, unitPrice: 1000, totalAmount: 10000, amountPaid: 10000, returnedQuantity: 0, returnedAmount: 0, refundedAmount: 0, ...o });

test("a paid sale: returning 3 credits 3000 and refunds 3000 by default", () => {
  assert.deepEqual(planReturn(sale(), { quantity: 3 }), { quantity: 3, amount: 3000, refund: 3000 });
});
test("an unpaid sale: nothing to refund, the balance just drops", () => {
  assert.deepEqual(planReturn(sale({ amountPaid: 0 }), { quantity: 3 }), { quantity: 3, amount: 3000, refund: 0 });
});
test("part-paid: refund only what was paid beyond what is still owed", () => {
  // paid 4000 of 10000; return 6 units (6000) -> still owes 4000, paid 4000 -> refund 0
  assert.equal(planReturn(sale({ amountPaid: 4000 }), { quantity: 6 }).refund, 0);
  // return 8 units (8000) -> owes 2000, paid 4000 -> refund 2000
  assert.equal(planReturn(sale({ amountPaid: 4000 }), { quantity: 8 }).refund, 2000);
});
test("can't return more than is left, or refund more than was overpaid", () => {
  assert.throws(() => planReturn(sale({ returnedQuantity: 8, returnedAmount: 8000, refundedAmount: 8000 }), { quantity: 3 }), /Only 2/);
  assert.throws(() => planReturn(sale({ amountPaid: 4000 }), { quantity: 6, refund: 500 }), /Nothing can be refunded/);
  assert.throws(() => planReturn(sale(), { quantity: 3, refund: 3500 }), /at most/);
  assert.throws(() => planReturn(sale(), { quantity: 3, amount: 99999 }), /can't be more/);
});
test("the credit can be edited (e.g. a restocking fee) and refund follows", () => {
  assert.deepEqual(planReturn(sale(), { quantity: 2, amount: 1800 }), { quantity: 2, amount: 1800, refund: 1800 + 0 });
});
test("returning the last units takes exactly the remaining value (no rounding drift)", () => {
  const s = sale({ quantity: 3, unitPrice: 33.33, totalAmount: 99.99, amountPaid: 99.99 });
  const r = planReturn(s, { quantity: 3 });
  assert.equal(r.amount, 99.99);
  assert.equal(r.refund, 99.99);
});
test("fully returned sale rejects another return; zero/negative quantity rejected", () => {
  assert.throws(() => planReturn(sale({ returnedQuantity: 10, returnedAmount: 10000 }), { quantity: 1 }), /already been returned/);
  assert.throws(() => planReturn(sale(), { quantity: 0 }));
  assert.throws(() => planReturn(sale(), { quantity: -2 }));
});

test("super admin: only the SUPER_ADMIN_EMAIL account holds the rank", () => {
  process.env.SUPER_ADMIN_EMAIL = "Boss@Example.com";
  assert.equal(roles.effectiveRole({ email: "boss@example.com", role: "staff" }), "superadmin");
  assert.equal(roles.effectiveRole({ email: "other@example.com", role: "superadmin" }), "owner"); // tampered DB can't make a second one
  assert.equal(roles.effectiveRole({ email: "other@example.com", role: "owner" }), "owner");
  assert.equal(roles.effectiveRole({ email: "x@example.com", role: "staff" }), "staff");
  assert.equal(roles.effectiveRole({ phone: "0803", role: "superadmin" }), "owner");
  assert.equal(roles.isOwnerLevel("superadmin"), true);
  assert.equal(roles.isOwnerLevel("owner"), true);
  assert.equal(roles.isOwnerLevel("staff"), false);
  delete process.env.SUPER_ADMIN_EMAIL;
  assert.equal(roles.effectiveRole({ email: "x@example.com", role: "owner" }), "owner");
});
