// Starts the real server (no database needed) and checks that the safety rules
// hold: validation, authentication, CORS, and that bad requests don't crash it.
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const PORT = 5099;
const base = `http://127.0.0.1:${PORT}`;
let server;

test.before(async () => {
  let output = "";
  let exited = null;
  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: {
      ...process.env, PORT: String(PORT), JWT_SECRET: "test-secret-test-secret-123",
      MONGODB_URI: "mongodb://127.0.0.1:1/none", MANIK_SKIP_DB: "1", BACKUP_SECRET: "backup-secret-1234567890",
      CORS_ORIGINS: "https://site.example", NODE_ENV: "test", KEEP_ALIVE: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => { output += d; });
  server.stderr.on("data", (d) => { output += d; });
  server.on("exit", (code) => { exited = code; });

  // Starting Node + loading every module can be slow on a busy Windows machine
  // (antivirus scans, other test files running at the same time), so wait up to 60s.
  for (let i = 0; i < 300; i++) {
    if (exited !== null) throw new Error(`The server exited immediately (code ${exited}). Its output:\n${output}`);
    try { if ((await fetch(base + "/")).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The server did not start within 60 seconds. Its output so far:\n${output || "(nothing)"}`);
});
test.after(() => server && server.kill());

const call = async (p, opts = {}) => {
  const r = await fetch(base + p, opts);
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};
const post = (p, body, headers = {}) =>
  call(p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("security headers are set", async () => {
  const r = await call("/");
  assert.strictEqual(r.headers.get("x-content-type-options"), "nosniff");
  assert.strictEqual(r.headers.get("x-frame-options"), "DENY");
  assert.ok(!r.headers.get("x-powered-by"));
});

test("bad input is rejected cleanly instead of crashing", async () => {
  assert.strictEqual((await call("/api/products/not-an-id")).status, 400);
  assert.strictEqual((await call("/api/products?category=zzz")).status, 400);
  assert.strictEqual((await post("/api/auth/login", {})).status, 400);
  assert.strictEqual((await post("/api/auth/login", { identifier: { $ne: 1 }, password: { $ne: 1 } })).status, 400);
  assert.strictEqual((await post("/api/auth/login", "{bad json")).status, 400);
  assert.strictEqual((await call("/nope")).status, 404);
  assert.strictEqual((await call("/")).status, 200, "server still alive");
});

test("private routes require a valid login", async () => {
  for (const p of ["/api/sales", "/api/reports/summary", "/api/audit", "/api/export/all.xlsx", "/api/export/backup", "/api/customers", "/api/quotations", "/api/stocktake"]) {
    assert.strictEqual((await call(p)).status, 401, p);
  }
  assert.strictEqual((await post("/api/restore", { backup: {} })).status, 401);
  assert.strictEqual((await post("/api/export/email-backup", {})).status, 401);
  const forged = jwt.sign({ id: "507f1f77bcf86cd799439011", role: "owner" }, "wrong-secret-wrong-secret");
  assert.strictEqual((await call("/api/expenses", { headers: { Authorization: "Bearer " + forged } })).status, 401);
  const none = jwt.sign({ id: "507f1f77bcf86cd799439011" }, "", { algorithm: "none" });
  assert.strictEqual((await call("/api/expenses", { headers: { Authorization: "Bearer " + none } })).status, 401);
});

test("huge restore uploads from strangers are refused before being read", async () => {
  const big = JSON.stringify({ backup: { products: new Array(100000).fill({ x: "y".repeat(100) }) } });
  assert.strictEqual((await post("/api/restore", big)).status, 401);
});

test("quote form: spam trap, validation", async () => {
  assert.strictEqual((await post("/api/quotes", { name: "Bot", phone: "1", website: "http://spam" })).status, 201);
  assert.strictEqual((await post("/api/quotes", { name: "", phone: "" })).status, 400);
  assert.strictEqual((await post("/api/quotes", { name: "A", phone: "1", requestType: "Material", product: "" })).status, 400);
});

test("backup endpoint needs the secret", async () => {
  assert.strictEqual((await post("/api/backup/run", {})).status, 401);
  assert.strictEqual((await post("/api/backup/run", {}, { "x-backup-secret": "wrong" })).status, 401);
});

test("CORS only allows the configured sites", async () => {
  const ask = (origin) => fetch(base + "/api/quotes", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
  assert.ok(!(await ask("https://evil.example")).headers.get("access-control-allow-origin"));
  assert.strictEqual((await ask("https://site.example")).headers.get("access-control-allow-origin"), "https://site.example");
});

test("session cookie helpers parse safely", () => {
  const { parseCookies } = require("../utils/session");
  assert.deepStrictEqual(parseCookies("a=1; manik_session=abc%20d; bad=%E0%A4%A"), { a: "1", manik_session: "abc d" });
  assert.deepStrictEqual(parseCookies(undefined), {});
});

test("a cookie-authenticated change without the CSRF header is refused before anything else", async () => {
  const token = jwt.sign({ id: "507f1f77bcf86cd799439011", role: "owner", tv: 0 }, "test-secret-test-secret-123");
  const r = await call("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "manik_session=" + token }, body: "{}" });
  assert.strictEqual(r.status, 403, "forged cross-site style request must be blocked");
});

test("credentialed CORS is granted only to listed sites", async () => {
  const ask = (origin) => fetch(base + "/api/auth/me", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } });
  assert.strictEqual((await ask("https://site.example")).headers.get("access-control-allow-credentials"), "true");
  assert.ok(!(await ask("https://evil.example")).headers.get("access-control-allow-credentials"));
});

test("logout clears the cookie and /me needs a session", async () => {
  const out = await fetch(base + "/api/auth/logout", { method: "POST" });
  assert.strictEqual(out.status, 200);
  const set = out.headers.get("set-cookie") || "";
  assert.ok(/manik_session=;/.test(set) && /HttpOnly/i.test(set) && /SameSite=Strict/i.test(set), set);
  assert.strictEqual((await call("/api/auth/me")).status, 401);
});

test("new routes reject bad ids and unauthenticated writes", async () => {
  assert.strictEqual((await post("/api/quotations", { customerName: "A", lines: [] })).status, 401);
  assert.strictEqual((await post("/api/stocktake", { counts: [] })).status, 401);
  assert.strictEqual((await post("/api/sales/507f1f77bcf86cd799439011/payments", { amount: 5 })).status, 401);
  assert.strictEqual((await call("/api/quotations/not-an-id")).status, 401); // auth is checked first
});
