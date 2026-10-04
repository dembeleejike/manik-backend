# Setup and deployment

## The three parts
| Part | Hosted on | Talks to |
|---|---|---|
| `manik-backend` (API) | Render (or any Node host) + MongoDB Atlas + Cloudinary | — |
| `manik-frontend` (public website) | Vercel | the API |
| `manik-admin` (dashboard) | Vercel | the API **through its own address** (`/api`) |

## Why the admin calls `/api` on its own address
Sign-in uses a secure cookie. Browsers — iPhones especially — refuse to keep a cookie that comes from a *different website* than the one you're on. So the admin app never talks to the backend's address directly: `manik-admin/vercel.json` forwards every `/api/*` request to the backend, and the browser sees one website. This is why `VITE_API_URL` in the admin is empty.

**If your backend address changes**, edit the `destination` in `manik-admin/vercel.json`.

**Alternative:** put the admin and API on sibling subdomains of one domain you own (`admin.yourshop.com` and `api.yourshop.com`), set `VITE_API_URL=https://api.yourshop.com` in the admin, and add `https://admin.yourshop.com` to `CORS_ORIGINS` on the backend. That also works because both are the same "site".

## Backend environment variables
| Variable | Meaning |
|---|---|
| `MONGODB_URI` | database connection |
| `JWT_SECRET` | 16+ random characters (the server refuses to start without it) |
| `BACKUP_SECRET` | 16+ random characters; same value as the GitHub secret |
| `CORS_ORIGINS` | the **public website** address(es), comma-separated. Not needed for the admin when it uses the `/api` forwarding |
| `TRUST_PROXY` | number of proxies in front of the app: `1` normally, **`2`** when the admin forwards through Vercel to Render. Affects only per-visitor rate limits |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD` | the mailbox the system **sends** from (Gmail address + app password). Required for any email |
| `OWNER_EMAIL` | optional extra recipient(s); backups and alerts already go to every owner account's email |
| `CLOUDINARY_*` | photo storage and private backups |
| `NODE_ENV` | `production` on the live server (makes cookies HTTPS-only **and switches on the keep-alive**) |
| `KEEP_ALIVE_URL`, `KEEP_ALIVE_MINUTES`, `KEEP_ALIVE` | optional — see "Keeping the backend awake" below |

## Keeping the backend awake
A free Render service falls asleep after about 15 minutes without visitors, and the next visitor waits up to a minute (sign-in through the admin can time out). The backend now **visits its own address every 10 minutes** so it never goes idle. There is nothing to set up: with `NODE_ENV=production` on Render it turns itself on (Render supplies the address automatically). In the Render **Logs** you will see `Keep-alive on: visiting https://… every 10 minutes` right after each start.

- To use a custom domain, set `KEEP_ALIVE_URL=https://api.yourshop.com`.
- On a paid plan that never sleeps, set `KEEP_ALIVE=off`.
- A free service that is awake all month uses about 744 of Render's 750 free hours, so keep **one** free service per account on this.
- Extra safety (optional): add a free monitor at uptimerobot.com for `https://YOUR-BACKEND/` every 5 minutes. It also wakes the service if Render restarts it.
- The nightly backup workflow also wakes the service once a day.

## First-time and upgrade steps
1. `npm install`
2. `node createAdmin.js you@example.com "a-long-passphrase" "Your Name"` (first time only)
3. **Upgrading an existing database:** `npm run migrate` once.
4. Everyone is signed out once after this upgrade (sessions changed) — just sign in again.
5. In GitHub add the secrets `API_URL` and `BACKUP_SECRET`, then run the *Nightly backup* workflow once from the Actions tab.

## Local development
Backend: `npm run dev` (port 5000). Admin: `npm run dev` — it forwards `/api` to `http://localhost:5000` automatically (change with `VITE_DEV_API`).

## Checks
`npm test` in the backend runs the automated checks (no database needed).
