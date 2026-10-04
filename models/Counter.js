const mongoose = require("mongoose");

// Hands out sequential numbers (quotation Q-2026-0001, 0002…) without ever
// giving the same number twice, even if two people create one at the same moment.
const counterSchema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } });
const Counter = mongoose.model("Counter", counterSchema);

async function nextNumber(key) {
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

module.exports = Counter;
module.exports.nextNumber = nextNumber;
