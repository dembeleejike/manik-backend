// Tests the stock-movement logic against a tiny in-memory stand-in for the Product
// collection. It understands exactly the update operators utils/stock.js uses, so
// these tests check the LOGIC (guards, totals, retries); real MongoDB behaviour is
// still worth a manual check on a test database.
const test = require("node:test");
const assert = require("node:assert");
const stock = require("../utils/stock");

class FakeProducts {
  constructor(docs) { this.docs = docs; this.beforeNextUpdate = null; }
  async findById(id) { const d = this.docs.find((x) => x._id === id); return d ? JSON.parse(JSON.stringify(d)) : null; }
  elemMatches(el, cond) {
    return Object.entries(cond).every(([k, v]) => (v && typeof v === "object" && "$gte" in v ? el[k] >= v.$gte : el[k] === v));
  }
  // index of the stock element the filter matched (what MongoDB's positional "$" refers to)
  matchIndex(doc, filter) {
    if (filter.stock && filter.stock.$elemMatch) return (doc.stock || []).findIndex((el) => this.elemMatches(el, filter.stock.$elemMatch));
    if (filter["stock.location"] !== undefined && typeof filter["stock.location"] === "string") return (doc.stock || []).findIndex((el) => el.location === filter["stock.location"]);
    return -1;
  }
  matches(doc, f) {
    if (f._id !== undefined && doc._id !== f._id) return false;
    if (f.$or && !f.$or.some((alt) => this.matches(doc, alt))) return false;
    if (f.quantity && f.quantity.$gt !== undefined && !(doc.quantity > f.quantity.$gt)) return false;
    if (f.stock) {
      if (f.stock.$elemMatch && this.matchIndex(doc, f) === -1) return false;
      if (f.stock.$exists === false && doc.stock !== undefined) return false;
      if (f.stock.$size === 0 && !(Array.isArray(doc.stock) && doc.stock.length === 0)) return false;
    }
    if (f["stock.location"] !== undefined) {
      const want = f["stock.location"];
      const has = (doc.stock || []).some((el) => el.location === (typeof want === "object" ? want.$ne : want));
      if (typeof want === "object" ? has : !has) return false;
    }
    return true;
  }
  async updateOne(filter, update, options = {}) {
    if (this.beforeNextUpdate) { const fn = this.beforeNextUpdate; this.beforeNextUpdate = null; fn(this); }
    const doc = this.docs.find((d) => this.matches(d, filter));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    const pos = this.matchIndex(doc, filter);
    if (Array.isArray(update)) { // the one pipeline form used: adopt a legacy product
      const set = update[0].$set;
      doc.stock = set.stock.map((s) => ({ location: s.location, quantity: s.quantity === "$quantity" ? doc.quantity : s.quantity }));
      return { matchedCount: 1, modifiedCount: 1 };
    }
    for (const [path, by] of Object.entries(update.$inc || {})) {
      if (path === "quantity") doc.quantity += by;
      else if (path === "stock.$.quantity") doc.stock[pos].quantity += by;
      else {
        const m = /^stock\.\$\[(\w+)\]\.quantity$/.exec(path);
        const filt = options.arrayFilters.find((f) => Object.keys(f)[0].startsWith(m[1] + "."));
        const loc = Object.values(filt)[0];
        doc.stock.find((el) => el.location === loc).quantity += by;
      }
    }
    if (update.$push) { doc.stock = doc.stock || []; doc.stock.push({ ...update.$push.stock }); }
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

const SHOP = "shop", WH = "warehouse", OTHER = "branch";
const total = (d) => (d.stock || []).reduce((n, s) => n + s.quantity, 0);
const make = (stockLines, extra = {}) => new FakeProducts([{ _id: "p1", quantity: stockLines.reduce((n, s) => n + s.quantity, 0), stock: stockLines, ...extra }]);

test("selling takes stock from one location only, and only if it has enough", async () => {
  const P = make([{ location: SHOP, quantity: 5 }, { location: WH, quantity: 100 }]);
  assert.strictEqual(await stock.take(P, "p1", SHOP, 3), true);
  assert.strictEqual(await stock.take(P, "p1", SHOP, 3), false, "only 2 left at the shop — the warehouse's 100 must not be used");
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), stock.quantityAt(d, WH), d.quantity], [2, 100, 102]);
  assert.strictEqual(d.quantity, total(d));
});

test("receiving adds to a location, creating its line the first time", async () => {
  const P = make([{ location: SHOP, quantity: 1 }]);
  await stock.put(P, "p1", WH, 40);
  await stock.put(P, "p1", WH, 10);
  await stock.put(P, "p1", SHOP, 2);
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), stock.quantityAt(d, WH), d.quantity], [3, 50, 53]);
  assert.strictEqual(d.quantity, total(d));
});

test("moving stock changes where it is, never how much there is", async () => {
  const P = make([{ location: WH, quantity: 30 }]);
  assert.strictEqual(await stock.move(P, "p1", WH, SHOP, 12), true); // the shop had no line at all yet
  let d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, WH), stock.quantityAt(d, SHOP), d.quantity], [18, 12, 30]);
  assert.strictEqual(await stock.move(P, "p1", SHOP, WH, 13), false, "can't move more than the shop holds");
  assert.strictEqual(await stock.move(P, "p1", WH, OTHER, 18), true);
  d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, WH), stock.quantityAt(d, OTHER), d.quantity], [0, 18, 30]);
  assert.strictEqual(d.quantity, total(d));
});

test("a stock count sets one location exactly and adjusts the total by the difference", async () => {
  const P = make([{ location: SHOP, quantity: 10 }, { location: WH, quantity: 40 }]);
  assert.deepStrictEqual(await stock.setAt(P, "p1", SHOP, 7), { before: 10, after: 7 });
  assert.deepStrictEqual(await stock.setAt(P, "p1", SHOP, 7), { before: 7, after: 7 });
  assert.deepStrictEqual(await stock.setAt(P, "p1", OTHER, 4), { before: 0, after: 4 }, "counting a new location creates its line");
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), stock.quantityAt(d, WH), stock.quantityAt(d, OTHER), d.quantity], [7, 40, 4, 51]);
  assert.strictEqual(d.quantity, total(d));
});

test("a sale that lands in the middle of a count is not overwritten — the count retries", async () => {
  const P = make([{ location: SHOP, quantity: 10 }]);
  P.beforeNextUpdate = (fake) => { fake.docs[0].stock[0].quantity -= 3; fake.docs[0].quantity -= 3; }; // a sale of 3 sneaks in
  const r = await stock.setAt(P, "p1", SHOP, 6);
  assert.deepStrictEqual(r, { before: 7, after: 6 }, "it re-read 7 (not the stale 10) before setting");
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), d.quantity], [6, 6]);
});

test("undoing a purchase never takes more than the location still holds", async () => {
  const P = make([{ location: WH, quantity: 4 }, { location: SHOP, quantity: 9 }]);
  assert.strictEqual(await stock.takeUpTo(P, "p1", WH, 10), 4);
  assert.strictEqual(await stock.takeUpTo(P, "p1", WH, 10), 0);
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, WH), stock.quantityAt(d, SHOP), d.quantity], [0, 9, 9]);
});

test("a product from before locations existed is adopted into the fallback location on first use", async () => {
  const P = new FakeProducts([{ _id: "p1", quantity: 10 }]); // no stock lines at all
  assert.strictEqual(await stock.take(P, "p1", SHOP, 3, SHOP), true);
  let d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), d.quantity], [7, 7]);

  const Q = new FakeProducts([{ _id: "p1", quantity: 10 }]);
  await stock.put(Q, "p1", WH, 5, SHOP); // received at the warehouse; the old 10 become the shop's
  d = await Q.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, SHOP), stock.quantityAt(d, WH), d.quantity], [10, 5, 15]);
  assert.strictEqual(d.quantity, total(d));
});

test("moving more than exists anywhere fails cleanly and changes nothing", async () => {
  const P = make([{ location: WH, quantity: 2 }]);
  assert.strictEqual(await stock.move(P, "p1", WH, SHOP, 5), false);
  const d = await P.findById("p1");
  assert.deepStrictEqual([stock.quantityAt(d, WH), d.quantity], [2, 2]);
});
