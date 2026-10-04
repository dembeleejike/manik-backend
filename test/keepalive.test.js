const test = require("node:test");
const assert = require("node:assert");
const { buildConfig, ping, start } = require("../utils/keepAlive");

test("switches on by itself on Render in production", () => {
  const c = buildConfig({ NODE_ENV: "production", RENDER_EXTERNAL_URL: "https://api.example.onrender.com/" });
  assert.deepStrictEqual(c, { url: "https://api.example.onrender.com", intervalMs: 600000, minutes: 10 });
});

test("stays off when developing locally, when switched off, or with no address", () => {
  assert.strictEqual(buildConfig({ RENDER_EXTERNAL_URL: "https://x.onrender.com" }), null); // not production
  assert.strictEqual(buildConfig({ NODE_ENV: "production" }), null);
  assert.strictEqual(buildConfig({ NODE_ENV: "production", RENDER_EXTERNAL_URL: "https://x.onrender.com", KEEP_ALIVE: "off" }), null);
  assert.strictEqual(buildConfig({ NODE_ENV: "production", KEEP_ALIVE_URL: "not-a-url" }), null);
});

test("a custom address works anywhere, and the interval is kept under Render's 15-minute sleep", () => {
  assert.strictEqual(buildConfig({ KEEP_ALIVE_URL: "https://api.shop.com", KEEP_ALIVE_MINUTES: "30" }).minutes, 14);
  assert.strictEqual(buildConfig({ KEEP_ALIVE_URL: "https://api.shop.com", KEEP_ALIVE_MINUTES: "0" }).minutes, 10);
  assert.strictEqual(buildConfig({ KEEP_ALIVE_URL: "https://api.shop.com", KEEP_ALIVE_MINUTES: "5" }).intervalMs, 300000);
});

test("a ping visits the home address and never throws, even when the visit fails", async () => {
  const seen = [];
  assert.strictEqual(await ping("https://x.com", async (u) => { seen.push(u); return { ok: true }; }), true);
  assert.deepStrictEqual(seen, ["https://x.com/"]);
  assert.strictEqual(await ping("https://x.com", async () => { throw new Error("offline"); }), false);
  assert.strictEqual(await ping("https://x.com", async () => ({ ok: false })), false);
});

test("start() schedules repeating visits and does nothing when off", async () => {
  assert.strictEqual(start({}), null);
  let visits = 0;
  const timer = start({ KEEP_ALIVE_URL: "https://x.com", KEEP_ALIVE_MINUTES: "1" }, async () => { visits++; return { ok: true }; });
  assert.ok(timer, "a timer was created");
  clearInterval(timer);
  assert.strictEqual(visits, 0);
});
