// The business is in Nigeria (WAT, UTC+1, no daylight saving) but the server
// runs in UTC. Without this, "today" and "this month" started an hour late and
// a custom "to" date silently excluded that whole day.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const LAGOS_TZ = "Africa/Lagos";

function startOfLagosDay(date = new Date()) {
  const l = new Date(date.getTime() + LAGOS_OFFSET_MS); // UTC getters now read Lagos wall-clock
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - LAGOS_OFFSET_MS);
}

function endOfLagosDay(date) {
  return new Date(startOfLagosDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Parses a ?from= / ?to= query value. Returns null if it isn't a valid date.
// A date-only value ("2026-10-02") is widened to the whole Lagos day.
function parseRangeBound(value, bound) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  if (!dateOnly) return d;
  // new Date("YYYY-MM-DD") is UTC midnight; re-anchor to the Lagos day.
  const lagosDay = new Date(d.getTime() + 12 * 60 * 60 * 1000);
  return bound === "from" ? startOfLagosDay(lagosDay) : endOfLagosDay(lagosDay);
}

// Builds a { date: { $gte, $lte } } filter from req.query, or {} if none/invalid.
function dateFilterFromQuery(query) {
  const from = parseRangeBound(query.from, "from");
  const to = parseRangeBound(query.to, "to");
  if (!from && !to) return {};
  const date = {};
  if (from) date.$gte = from;
  if (to) date.$lte = to;
  return { date };
}

module.exports = { LAGOS_TZ, LAGOS_OFFSET_MS, startOfLagosDay, endOfLagosDay, parseRangeBound, dateFilterFromQuery };
