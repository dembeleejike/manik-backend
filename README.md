# MANIK Backend API

Node.js + Express + MongoDB backend for the MANIK website — handles products,
categories, quote requests, project gallery, and admin login.

## 1. Install

```bash
npm install
```

## 2. Set up your environment

```bash
cp .env.example .env
```

Then fill in `.env` with:

- **MONGODB_URI** — from MongoDB Atlas: create a free cluster, click "Connect" → "Connect your application", copy the string, replace `<password>` with your real database user password.
- **JWT_SECRET** — any random string. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET** — from your Cloudinary dashboard homepage.
- **EMAIL_USER / EMAIL_APP_PASSWORD** — a Gmail address to send FROM. The app password (not your real Gmail password) comes from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) — requires 2-Step Verification turned on first.
- **EMAIL_USER / EMAIL_APP_PASSWORD** — the mailbox the system sends from (a Gmail address and an app password).
- **OWNER_EMAIL** — optional extra recipient(s). Backups, new-quote alerts and low-stock alerts go to the email of every **owner account**; this only adds more addresses.

## 3. Create the admin login

Pass the owner's login on the command line (an email **or** a phone number, a password of at least 8 characters, and a name). Nothing is written into any file:

```bash
node createAdmin.js owner@example.com "a-long-passphrase" "Owner Name"
# or with a phone number:
node createAdmin.js 08060984868 "a-long-passphrase" "Owner Name"
```

Admins sign in with their email or phone number. More logins (owner or staff) are added from the dashboard's Admins page.

### Upgrading an existing database

If you already have data from an earlier version, run this **once** after deploying (it is safe to re-run). It rebuilds the admin indexes so phone logins work, standardises phone numbers so the same customer is never split in two, and corrects product stock statuses:

```bash
npm run migrate
```

If your old owner account was created before roles existed: `node promoteToOwner.js you@example.com`.

## Security settings

- **CORS_ORIGINS** — set this to your website and admin dashboard URLs (comma-separated). Without it the API accepts requests from any site.
- **JWT_SECRET** and **BACKUP_SECRET** must each be at least 16 random characters; the server refuses to start without a valid `JWT_SECRET`.
- Behind a hosting proxy (Render etc.) the app trusts one proxy hop so rate limits count each visitor separately.
- Backups are stored **privately** in Cloudinary (open them from the Cloudinary console) and a copy is emailed to the owner. The backup link is no longer returned by the API.
- Public product responses hide cost price, selling price and stock counts; logged-in admins still see them.

## 4. Run it

```bash
npm run dev
```

Runs on `http://localhost:5000` by default. Visit `http://localhost:5000/` — you should see `{"status":"MANIK API is running"}`.

## API Overview

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Admin login (`identifier` = email or phone, `password`), returns a token |
| PUT | `/api/auth/password` | admin | Change your own password |
| GET | `/api/products` | — | List products (public) |
| GET | `/api/products/:id` | — | Single product (public) |
| POST | `/api/products` | admin | Create product (with images) |
| PUT | `/api/products/:id` | admin | Update product |
| DELETE | `/api/products/:id` | admin | Delete product |
| GET | `/api/categories` | — | List categories (public) |
| POST/PUT/DELETE | `/api/categories` | admin | Manage categories |
| GET | `/api/projects` | — | List gallery projects (public) |
| POST/PUT/DELETE | `/api/projects` | admin | Manage gallery projects |
| POST | `/api/quotes` | — | Submit a quote request (public — this is what the site's form hits) |
| GET | `/api/quotes` | admin | View all quote requests |
| PUT | `/api/quotes/:id` | admin | Update quote status |
| DELETE | `/api/quotes/:id` | admin | Delete a quote |
| GET | `/api/export/backup` | owner | Download the full backup (.json) |
| POST | `/api/export/email-backup` | owner | Email a backup (.json + Excel) to the address in the body `{ email, password }`; the password re-confirms the person. Limited to 6 per hour |
| GET | `/api/export/:dataset.:format` | owner | Spreadsheet export. dataset: `products` `sales` `purchases` `expenses` `customers` `quotes` `all`; format: `xlsx` or `csv`; optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| POST | `/api/restore` | owner | Restore from a backup file. `{ backup, dryRun }` — `dryRun: true` only previews |
| POST | `/api/auth/logout` | — | Clear the session cookie |
| GET | `/api/auth/me` | admin | Who is signed in |
| POST | `/api/sales/:id/payments` | admin | Record a later payment on a sale (`amount`, `method`, `date`, `note`) |
| DELETE | `/api/sales/:id/payments/:paymentId` | owner | Undo a payment |
| GET/POST | `/api/quotations` | admin | List / create a priced quotation |
| PUT | `/api/quotations/:id` | admin | Edit (while Draft / Sent / Accepted) |
| PUT | `/api/quotations/:id/status` | admin | Draft / Sent / Accepted / Declined |
| POST | `/api/quotations/:id/convert` | admin | Turn the stock items into sales (`deposit`, `paymentMethod`) |
| DELETE | `/api/quotations/:id` | owner | Delete |
| GET | `/api/stocktake` | admin | History of stock counts and corrections |
| POST | `/api/stocktake` | admin | Save a stock count `{ counts: [{ product, counted }], note }` |
| GET | `/api/audit` | owner | Activity log. Optional `?q=&action=&from=&to=&limit=` |
| POST | `/api/backup/run` | backup secret | Nightly backup (called by the scheduled GitHub Action) |

Admin routes need a header: `Authorization: Bearer <token>` (the token you get back from `/api/auth/login`).

## Deploying

Render or Railway both work well for this (Vercel is built for frontends/serverless, not a good fit for a long-running Express server like this one). On either:

1. Push this folder to its own GitHub repo (separate from the frontend).
2. Connect that repo on Render/Railway.
3. Add all the same `.env` values as environment variables in their dashboard.
4. Set the start command to `npm start`.

## Security notes

- `.env` is already in `.gitignore` — never commit it.
- CORS is currently wide open (`app.use(cors())`). Before going live, restrict it to your actual site's domain in `server.js`.
- Passwords are hashed with bcrypt before being stored — never stored in plain text.


## Documentation

- [`docs/SETUP_AND_DEPLOYMENT.md`](docs/SETUP_AND_DEPLOYMENT.md) — environment variables, the `/api` forwarding that makes secure sign-in work, upgrade steps
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — plain-language guide for the shop owner and staff
- [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md) — how backups work, how to restore, and what a restore does and doesn't do
- [`docs/PRIVACY_AND_DATA.md`](docs/PRIVACY_AND_DATA.md) — what data is kept, who can see it, and how it is protected

## Tests

`npm test` runs 16 automated checks (no database needed): phone/date helpers, the Excel/CSV writer, and the server's safety rules (login required, bad input rejected, CORS, spam trap, backup secret).
