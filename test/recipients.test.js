const test = require("node:test");
const assert = require("node:assert");
process.env.JWT_SECRET = "test-secret-test-secret-123";
const { isValidEmail, mailerConfigured } = require("../utils/recipients");

test("email addresses are checked before a backup is sent anywhere", () => {
  for (const ok of ["owner@gmail.com", "a.b+tag@sub.example.co", "  trimmed@example.com  "]) assert.ok(isValidEmail(ok), ok);
  for (const bad of ["", "no-at-sign", "a@b", "two@@example.com", "a b@example.com", "a@example.com,evil@example.com", "a@example.com;evil@x.com", "<x@example.com>", null, 42, "a@" + "b".repeat(300) + ".com"]) {
    assert.ok(!isValidEmail(bad), String(bad));
  }
});

test("the sending mailbox needs both the address and the app password", () => {
  const keep = { u: process.env.EMAIL_USER, p: process.env.EMAIL_APP_PASSWORD };
  delete process.env.EMAIL_USER; delete process.env.EMAIL_APP_PASSWORD;
  assert.strictEqual(mailerConfigured(), false);
  process.env.EMAIL_USER = "x@gmail.com";
  assert.strictEqual(mailerConfigured(), false);
  process.env.EMAIL_APP_PASSWORD = "abcdabcdabcdabcd";
  assert.strictEqual(mailerConfigured(), true);
  process.env.EMAIL_USER = keep.u; process.env.EMAIL_APP_PASSWORD = keep.p;
  if (keep.u === undefined) delete process.env.EMAIL_USER;
  if (keep.p === undefined) delete process.env.EMAIL_APP_PASSWORD;
});
