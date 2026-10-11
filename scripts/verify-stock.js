// Checks the stock logic against a REAL MongoDB — the part that cannot be proven without one
// (positional updates, array filters, the "adopt old stock" update, and two people acting at the
// same instant). It creates its own temporary places and products, runs the checks, and deletes
// everything it made. It never touches your real products.
//
// RUN IT ONLY AGAINST A TEST DATABASE. In MongoDB Atlas a different database is just a different
// name at the end of the link, e.g. ...mongodb.net/manik_test?retryWrites=true...
//
//   CONFIRM_TEST_DB=yes MONGODB_URI="mongodb+srv://.../manik_test?..." npm run verify:stock
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Product");
const Location = require("../models/Location");
const Category = require("../models/Category");
const stock = require("../utils/stock");

if (process.env.CONFIRM_TEST_DB !== "yes") {
  console.error("Refusing to run: set CONFIRM_TEST_DB=yes and point MONGODB_URI at a TEST database (not your real one).");
  process.exit(1);
}

const tag = "verify-" + Math.random().toString(36).slice(2, 8);
let passed = 0, failed = 0;
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log("  PASS  " + name); }
  else { failed++; console.log("  FAIL  " + name + (detail !== undefined ? "  -> " + JSON.stringify(detail) : "")); }
};
const total = (d) => (d.stock || []).reduce((n, s) => n + s.quantity, 0);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to database "${mongoose.connection.name}". Everything created here is named ${tag}-* and removed at the end.\n`);

  const A = await Location.create({ name: `${tag}-A`, kind: "other" });
  const B = await Location.create({ name: `${tag}-B`, kind: "other" });
  const cat = await Category.create({ name: `${tag}-cat`, slug: `${tag}-cat` });
  const newProduct = (name, extra = {}) => Product.create({ name: `${tag}-${name}`, ref: `${tag}-${name}`, category: cat._id, ...extra });
  const get = (id) => Product.findById(id);

  try {
    console.log("Receiving, selling, moving, counting");
    let p = await newProduct("basic");
    await stock.put(Product, p._id, A._id, 10);
    await stock.put(Product, p._id, B._id, 5);
    let d = await get(p._id);
    check("receiving at two places gives the right total", d.quantity === 15 && stock.quantityAt(d, A._id) === 10 && stock.quantityAt(d, B._id) === 5, { q: d.quantity, stock: d.stock });
    check("total equals the sum of the places", d.quantity === total(d));

    check("selling 3 from A works", (await stock.take(Product, p._id, A._id, 3)) === true);
    check("selling 8 more from A is refused (only 7 there; B's stock is not used)", (await stock.take(Product, p._id, A._id, 8)) === false);
    d = await get(p._id);
    check("after selling: A=7, B=5, total 12", stock.quantityAt(d, A._id) === 7 && stock.quantityAt(d, B._id) === 5 && d.quantity === 12, d.stock);

    check("moving 4 from A to B works", (await stock.move(Product, p._id, A._id, B._id, 4)) === true);
    check("moving 99 from A is refused", (await stock.move(Product, p._id, A._id, B._id, 99)) === false);
    d = await get(p._id);
    check("after moving: A=3, B=9, total unchanged (12)", stock.quantityAt(d, A._id) === 3 && stock.quantityAt(d, B._id) === 9 && d.quantity === 12 && d.quantity === total(d), d.stock);

    const counted = await stock.setAt(Product, p._id, A._id, 1);
    d = await get(p._id);
    check("a stock count sets A to 1 and the total follows (10)", counted.before === 3 && counted.after === 1 && d.quantity === 10 && d.quantity === total(d), { counted, q: d.quantity });

    const removed = await stock.takeUpTo(Product, p._id, B._id, 100);
    d = await get(p._id);
    check("undoing a purchase removes only what is there (9) and never goes negative", removed === 9 && stock.quantityAt(d, B._id) === 0 && d.quantity === 1, { removed, q: d.quantity });

    console.log("\nStock from before locations existed");
    // inserted straight into the collection so it has a quantity but NO stock lines, like an old product
    const raw = await Product.collection.insertOne({ name: `${tag}-legacy`, ref: `${tag}-legacy`, category: cat._id, quantity: 6, status: "In stock", lowStockThreshold: 5, images: [], createdAt: new Date(), updatedAt: new Date() });
    check("old stock can be sold: it is adopted into the fallback place first", (await stock.take(Product, raw.insertedId, A._id, 2, A._id)) === true);
    d = await get(raw.insertedId);
    check("old product now has A=4 and total 4", stock.quantityAt(d, A._id) === 4 && d.quantity === 4, d.stock);

    console.log("\nTwo people at the same instant");
    p = await newProduct("race1");
    await stock.put(Product, p._id, A._id, 5);
    const sales = await Promise.all(Array.from({ length: 12 }, () => stock.take(Product, p._id, A._id, 1)));
    d = await get(p._id);
    check("12 simultaneous sales of 1 against 5 in stock: exactly 5 succeed", sales.filter(Boolean).length === 5, sales.filter(Boolean).length);
    check("…and stock ends at exactly 0, never negative", stock.quantityAt(d, A._id) === 0 && d.quantity === 0, d.stock);

    p = await newProduct("race2");
    await stock.put(Product, p._id, A._id, 5);
    const moves = await Promise.all(Array.from({ length: 12 }, () => stock.move(Product, p._id, A._id, B._id, 1)));
    d = await get(p._id);
    check("12 simultaneous moves of 1 out of 5: exactly 5 succeed", moves.filter(Boolean).length === 5, moves.filter(Boolean).length);
    check("…A=0, B=5, total still 5", stock.quantityAt(d, A._id) === 0 && stock.quantityAt(d, B._id) === 5 && d.quantity === 5, d.stock);

    p = await newProduct("race3");
    await Promise.all(Array.from({ length: 10 }, () => stock.put(Product, p._id, A._id, 1)));
    d = await get(p._id);
    check("10 simultaneous deliveries of 1 to a new place: exactly 10 recorded, one line only", stock.quantityAt(d, A._id) === 10 && d.stock.length === 1 && d.quantity === 10, d.stock);
  } finally {
    await Product.deleteMany({ name: new RegExp(`^${tag}-`) });
    await Location.deleteMany({ name: new RegExp(`^${tag}-`) });
    await Category.deleteMany({ name: new RegExp(`^${tag}-`) });
    console.log("\nTemporary test data removed.");
    await mongoose.disconnect();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

run().catch(async (err) => {
  console.error("\nThe check could not finish:", err.message);
  try { await Product.deleteMany({ name: new RegExp(`^${tag}-`) }); await Location.deleteMany({ name: new RegExp(`^${tag}-`) }); await Category.deleteMany({ name: new RegExp(`^${tag}-`) }); } catch { /* best effort */ }
  process.exit(1);
});
