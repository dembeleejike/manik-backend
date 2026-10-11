// All stock movement goes through these few functions. A product keeps one stock
// line per location ({ location, quantity }) and a `quantity` that is ALWAYS the
// total across locations. Every function below changes the location line and the
// total in the SAME single database update, so the two can never drift apart and
// two people working at once can never take the same unit twice.
//
// Each function takes the Product model as its first argument so the logic can be
// tested without a database.

const ATTEMPTS = 5;

const entryOf = (doc, locId) => (doc && doc.stock ? doc.stock.find((s) => String(s.location) === String(locId)) : undefined);
const quantityAt = (doc, locId) => (entryOf(doc, locId) ? entryOf(doc, locId).quantity : 0);

// Products created before locations existed have a `quantity` but no stock lines.
// The first time such a product is touched, its whole quantity is placed at
// `fallbackLocId` (normally the shop), so nothing ever fails or goes missing.
async function adoptLegacy(Product, productId, fallbackLocId) {
  if (!fallbackLocId) return false;
  const r = await Product.updateOne(
    { _id: productId, $or: [{ stock: { $exists: false } }, { stock: { $size: 0 } }], quantity: { $gt: 0 } },
    [{ $set: { stock: [{ location: fallbackLocId, quantity: "$quantity" }] } }]
  );
  return r.modifiedCount === 1;
}

// Remove `qty` from a location, only if that location holds at least that much.
// Returns true if it was taken.
async function take(Product, productId, locId, qty, fallbackLocId) {
  for (let i = 0; i < 2; i++) {
    const r = await Product.updateOne(
      { _id: productId, stock: { $elemMatch: { location: locId, quantity: { $gte: qty } } } },
      { $inc: { "stock.$.quantity": -qty, quantity: -qty } }
    );
    if (r.modifiedCount === 1) return true;
    if (i === 0 && (await adoptLegacy(Product, productId, fallbackLocId))) continue; // legacy product: adopt, then retry once
    return false;
  }
  return false;
}

// Add `qty` to a location (creating the location's stock line if it's the first time).
async function put(Product, productId, locId, qty, fallbackLocId) {
  await adoptLegacy(Product, productId, fallbackLocId);
  for (let i = 0; i < ATTEMPTS; i++) {
    const inc = await Product.updateOne({ _id: productId, "stock.location": locId }, { $inc: { "stock.$.quantity": qty, quantity: qty } });
    if (inc.modifiedCount === 1) return;
    const push = await Product.updateOne(
      { _id: productId, "stock.location": { $ne: locId } },
      { $push: { stock: { location: locId, quantity: qty } }, $inc: { quantity: qty } }
    );
    if (push.modifiedCount === 1) return;
  }
  throw new Error("Couldn't update stock (the product may have been deleted).");
}

// Remove up to `qty` from a location (never below zero). Returns how much was removed.
// Used when undoing a purchase whose stock may already have been partly sold.
async function takeUpTo(Product, productId, locId, qty, fallbackLocId) {
  for (let i = 0; i < ATTEMPTS; i++) {
    const doc = await Product.findById(productId);
    if (!doc) return 0;
    const have = quantityAt(doc, locId);
    const n = Math.min(have, qty);
    if (n <= 0) return 0;
    if (await take(Product, productId, locId, n, fallbackLocId)) return n;
  }
  return 0;
}

// Make a location hold exactly `target` (used by stock counts). Returns { before, after }.
// Safe against a sale happening at the same moment: if the number changes under us,
// it re-reads and tries again instead of overwriting the sale.
async function setAt(Product, productId, locId, target, fallbackLocId) {
  await adoptLegacy(Product, productId, fallbackLocId);
  for (let i = 0; i < ATTEMPTS; i++) {
    const doc = await Product.findById(productId);
    if (!doc) throw new Error("That product no longer exists.");
    const entry = entryOf(doc, locId);
    const cur = entry ? entry.quantity : 0;
    if (cur === target) return { before: cur, after: cur };
    const delta = target - cur;
    const r = entry
      ? await Product.updateOne({ _id: productId, stock: { $elemMatch: { location: locId, quantity: cur } } }, { $inc: { "stock.$.quantity": delta, quantity: delta } })
      : await Product.updateOne({ _id: productId, "stock.location": { $ne: locId } }, { $push: { stock: { location: locId, quantity: target } }, $inc: { quantity: delta } });
    if (r.modifiedCount === 1) return { before: cur, after: target };
  }
  throw new Error("The stock changed while it was being counted. Please try again.");
}

// Move `qty` from one location to another. The total does not change. Returns true if moved.
async function move(Product, productId, fromId, toId, qty, fallbackLocId) {
  await adoptLegacy(Product, productId, fallbackLocId);
  // make sure the destination has a line to receive into (no change to totals)
  await Product.updateOne({ _id: productId, "stock.location": { $ne: toId } }, { $push: { stock: { location: toId, quantity: 0 } } });
  const r = await Product.updateOne(
    { _id: productId, stock: { $elemMatch: { location: fromId, quantity: { $gte: qty } } } },
    { $inc: { "stock.$[src].quantity": -qty, "stock.$[dst].quantity": qty } },
    { arrayFilters: [{ "src.location": fromId }, { "dst.location": toId }] }
  );
  return r.modifiedCount === 1;
}

module.exports = { quantityAt, entryOf, take, put, takeUpTo, setAt, move, adoptLegacy };
