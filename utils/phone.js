// Phone numbers are the matching key between sales and customers, and the
// login identifier for phone-based admins. "0806 098 4868", "+234 806 098 4868"
// and "2348060984868" must all be treated as the same number.
function normalizePhone(raw) {
  if (raw == null) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2); // 00234... international prefix
  if (digits.startsWith("234") && digits.length === 13) digits = "0" + digits.slice(3);
  else if (digits.length === 10 && !digits.startsWith("0")) digits = "0" + digits; // 806... missing leading 0
  return digits;
}

function looksLikeEmail(value) {
  return typeof value === "string" && value.includes("@");
}

module.exports = { normalizePhone, looksLikeEmail };
