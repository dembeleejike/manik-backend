// Keeps a free-tier host (Render) from putting the API to sleep.
//
// Free hosts stop a service after ~15 minutes with no visitors, and the next
// visitor then waits up to a minute for it to wake. This makes the server visit
// its OWN public address every few minutes, which the host counts as traffic,
// so it never goes idle. Nothing to configure on Render: it provides
// RENDER_EXTERNAL_URL automatically, and this turns itself on in production.
//
// Environment (all optional):
//   KEEP_ALIVE=off            turn it off (e.g. on a paid plan that never sleeps)
//   KEEP_ALIVE_URL=https://…  address to visit (use your custom domain if you have one)
//   KEEP_ALIVE_MINUTES=10     how often (1–14; Render sleeps at 15)

function buildConfig(env = process.env) {
  if (String(env.KEEP_ALIVE || "").toLowerCase() === "off") return null;
  const url = (env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (!url || !/^https?:\/\//i.test(url)) return null;
  // Only in production, or when an address was set on purpose — never while developing locally.
  if (env.NODE_ENV !== "production" && !env.KEEP_ALIVE_URL) return null;
  const minutes = Math.min(14, Math.max(1, Number(env.KEEP_ALIVE_MINUTES) || 10));
  return { url, intervalMs: minutes * 60 * 1000, minutes };
}

// One visit. Never throws: a failed ping is logged and the next one tries again.
async function ping(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return false;
  try {
    const res = await fetchImpl(url + "/", { method: "GET", signal: AbortSignal.timeout(30000), headers: { "User-Agent": "manik-keep-alive" } });
    return res.ok;
  } catch (err) {
    console.error("Keep-alive ping failed:", err.message);
    return false;
  }
}

function start(env = process.env, fetchImpl = globalThis.fetch) {
  const config = buildConfig(env);
  if (!config) return null;
  console.log(`Keep-alive on: visiting ${config.url} every ${config.minutes} minutes`);
  const timer = setInterval(() => ping(config.url, fetchImpl), config.intervalMs);
  return timer;
}

module.exports = { buildConfig, ping, start };
