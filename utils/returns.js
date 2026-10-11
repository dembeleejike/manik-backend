// The arithmetic and limits of a sales return, kept free of the database so it can be tested.
const { HttpError, requireNumber } = require("./helpers");

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;
const money = (n) => "\u20a6" + Number(n).toLocaleString("en-NG");

// sale: { quantity, unitPrice, totalAmount, amountPaid, returnedQuantity, returnedAmount, refundedAmount }
// input: { quantity, amount?, refund? }   ->   { quantity, amount, refund }
function planReturn(sale, input) {
  const leftQty = round4(sale.quantity - (sale.returnedQuantity || 0));
  const leftValue = round2(sale.totalAmount - (sale.returnedAmount || 0));
  if (leftQty <= 0.00005) throw new HttpError(400, "Everything on this sale has already been returned.");

  const quantity = round4(requireNumber(input.quantity, "quantity", { min: 0, exclusiveMin: true }));
  if (quantity > leftQty + 0.00005) throw new HttpError(400, `Only ${leftQty} can still be returned on this sale.`);
  const lastOfIt = Math.abs(quantity - leftQty) < 0.00005;

  let amount;
  if (input.amount === undefined || input.amount === "") amount = lastOfIt ? leftValue : round2(quantity * sale.unitPrice);
  else amount = round2(requireNumber(input.amount, "amount", { min: 0 }));
  if (amount > leftValue + 0.005) throw new HttpError(400, `The credit can't be more than ${money(leftValue)}, the value still left on this sale.`);
  amount = Math.min(amount, leftValue);

  const netPaid = sale.amountPaid - (sale.refundedAmount || 0);
  const maxRefund = Math.max(0, round2(netPaid - (leftValue - amount)));
  let refund;
  if (input.refund === undefined || input.refund === "") refund = maxRefund;
  else refund = round2(requireNumber(input.refund, "refund", { min: 0 }));
  if (refund > maxRefund + 0.005) {
    throw new HttpError(400, maxRefund > 0
      ? `You can refund at most ${money(maxRefund)} — that's what the customer has paid beyond what they still owe.`
      : "Nothing can be refunded here: the customer hasn't paid more than they still owe. Leave the refund at 0 — the balance drops instead.");
  }
  refund = Math.min(refund, maxRefund);

  return { quantity, amount, refund };
}

module.exports = { planReturn, round2, round4 };
