// Sign-in session handling. The login token lives in an httpOnly cookie, so
// JavaScript on the page (including any injected script) can never read it —
// unlike localStorage, which any script on the page can read.
const COOKIE_NAME = "manik_session";
const SESSION_HOURS = 12;

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore a malformed cookie */ }
  }
  return out;
}

// SameSite=Strict: the browser only sends the cookie when the request comes from
// this same site, which is also what blocks cross-site request forgery.
function cookieOptions(req) {
  return {
    httpOnly: true,
    secure: !!(req && req.secure) || process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api",
  };
}

function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_HOURS * 60 * 60 * 1000 });
}

function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
}

module.exports = { COOKIE_NAME, SESSION_HOURS, parseCookies, setSessionCookie, clearSessionCookie };
