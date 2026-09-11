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
- **OWNER_EMAIL** — the real inbox that should receive quote notifications.

## 3. Create the admin login

Open `createAdmin.js`, change the `EMAIL` and `PASSWORD` at the top to real values, then run:

```bash
npm run create-admin
```

This creates the one login the owner will use for the dashboard. You can delete or clear the password out of `createAdmin.js` afterward.

## 4. Run it

```bash
npm run dev
```

Runs on `http://localhost:5000` by default. Visit `http://localhost:5000/` — you should see `{"status":"MANIK API is running"}`.

## API Overview

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | — | Admin login, returns a token |
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
