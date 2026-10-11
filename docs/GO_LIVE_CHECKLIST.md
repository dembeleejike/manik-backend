# Go-live checklist

Do these in order. Tick each one. If anything fails, stop and see "If something goes wrong" at the bottom.

## 0. Before anything
- [ ] In the **current** admin: *Business Settings → Download full backup*. Keep that file safe.
- [ ] Tell staff the system will be briefly updated.

## 1. Check the stock logic on a TEST database (recommended, 5 minutes)
The stock moves use database features that can only be proven against a real MongoDB. In MongoDB Atlas, a test database is just a different name in the link (e.g. `.../manik_test?...` instead of `.../manik?...`).
```
CONFIRM_TEST_DB=yes MONGODB_URI="mongodb+srv://USER:PASS@cluster.../manik_test?retryWrites=true" npm run verify:stock
```
- [ ] It ends with `N passed, 0 failed.` It creates its own temporary data and removes it, and refuses to run without `CONFIRM_TEST_DB=yes`.
- [ ] Also run `npm test` (no database needed): it ends with `fail 0`.

## 2. Deploy the backend
- [ ] Copy the backend zip contents into `manik-backend`, then `git add -A`, `git commit`, `git push`.
- [ ] Render shows **Live**; Logs show `MANIK API running` and `Keep-alive on`.
- [ ] Render environment has: `NODE_ENV=production`, `TRUST_PROXY=2`, `JWT_SECRET`, `BACKUP_SECRET`, `CORS_ORIGINS` (public site), `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `MONGODB_URI`, Cloudinary keys.

## 3. Upgrade the data (once)
- [ ] `MONGODB_URI="your link" npm run migrate`
- [ ] It prints "Admin phone numbers standardised", "Stock locations ready (Shop received the existing stock of N products)" and "Migration complete."
- To start everything in the warehouse instead: `MIGRATE_STOCK_LOCATION=Warehouse npm run migrate`.

## 4. Deploy the admin and (optionally) the public site
- [ ] Copy the admin zip contents into `manik-admin`; push.
- [ ] In Vercel → admin project → Environment Variables: `VITE_API_URL` is **deleted**; `vercel.json` destination is your Render address.
- [ ] Hard refresh (Ctrl+F5) and sign in.

## 5. Test every feature once (on a phone as well as a computer)
**Sign-in and roles**
- [ ] Sign in as owner. Stay signed in after a page refresh.
- [ ] Create a staff login. Sign in as staff: cost prices, profit, Customers, Reports, Settings, Activity log are NOT available.
- [ ] Change password: a wrong current password shows an error and does NOT log you out.

**Stock places**
- [ ] Settings → Stock locations shows Shop and Warehouse (Warehouse receives new stock, Shop sales come from).
- [ ] Stock on hand → totals look right; existing stock shows under the Shop (or where you migrated it).
- [ ] Purchases → record 20 of a product → it lands in the Warehouse (shown on the card).
- [ ] Stock on hand → Move stock → move 8 from Warehouse to Shop → Moves tab shows it; the product's chips change (Warehouse −8, Shop +8); the total is unchanged.
- [ ] Sales → sell 3 from the Shop → Shop −3.
- [ ] Try to sell more than the Shop holds → a clear message that says how many are at the Warehouse.
- [ ] Delete that sale (owner) → the 3 return to the Shop.

**Counts**
- [ ] Stock count → choose Shop + one category → type counts → Review shows the differences → Save. Only that place and category changed; History shows it with place and category.

**Money**
- [ ] A sale with "Partial" payment → Record payment → status becomes Paid at the right moment; it cannot go over the amount owed.
- [ ] Customer → Account statement PDF opens correctly; WhatsApp reminder text looks right.

**Documents**
- [ ] New quotation (stock items + a service line) → PDF downloads and looks right → Convert to sales (with a deposit) → stock goes down at the chosen place; the service line is reported as "not recorded as sales".
- [ ] Sale → Invoice PDF and Receipt PDF.

**Export / backup**
- [ ] Settings → spreadsheets: "Stock by location" downloads and opens in Excel.
- [ ] "Email a backup…" → type your email + password → email arrives with two files.
- [ ] Share button: on Chrome it says "Share (CSV)"; on iPhone Safari it shares Excel.
- [ ] Restore: choose the backup file you downloaded in step 0 → the preview table appears → press **Cancel** (do not restore on live data unless you mean to).

**Photos and website**
- [ ] Add a product with a big phone photo → it uploads (shrunk automatically); remove a photo with the red ✕.
- [ ] Public website: products load, the quote form sends, no prices/stock counts are visible.

## 6. Housekeeping
- [ ] GitHub → Actions: your backup workflow and keep-alive workflow are present; run the backup once and see a green tick.
- [ ] Delete the stray lines in your local `.env`; make sure `.env` is not committed.

## If something goes wrong
1. **Backend broken:** Render → *Deploys* → choose the previous deploy → **Rollback**. (The old admin works with the old backend only.)
2. **Admin broken:** Vercel → *Deployments* → previous deployment → **Promote to Production**.
3. **Data looks wrong:** do not delete anything. *Restore* only puts records back (it never removes newer ones). For stock, run a **Stock count** per place and category — it is recorded and safe. Your step-0 backup is the safety net.
4. Send the exact error message (and the Render log line) to the developer.

## Known limits (by design)
- Low-stock warnings compare the **total** across all places, not each place separately (the Overview also warns when the shop is low but another place has stock).
- Quotation conversion takes goods from **one** place per conversion.
- Undoing a purchase removes stock only from the place it was delivered to, and only what is still there.
- PDF fonts can't show some accent marks (Yoruba/Igbo); they print as the plain letter.


**Super admin and returns (new)**
- [ ] In Render → Environment add `SUPER_ADMIN_EMAIL` = your own login email (the login must already exist). Redeploy; the log says "Super admin rank applied."
- [ ] Sign in as that email: sidebar shows "Super admin", and the Admins page lists everyone including you.
- [ ] Add a test Admin, sign in as them: they do NOT see you in Admins or in the Activity log, can add, promote/demote and remove admins and staff, but cannot change or remove you.
- [ ] Record a sale of 5 → press Return, 2 units → stock goes up by 2 at the chosen place, the sale shows "Part returned", Reports revenue drops by the credit.
- [ ] Return on an unpaid sale → no refund offered, balance owed drops. Undo the return (admin) → stock and balance go back.
- [ ] Customer statement PDF shows the return as a credit line (and a refund line if money was handed back).
