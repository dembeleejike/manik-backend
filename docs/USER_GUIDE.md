# MANIK dashboard — User guide

This guide is for the shop owner and staff. No technical knowledge needed.

## Signing in
Sign in with your **email address or phone number** and your password. You stay signed in for 12 hours, then you are asked to sign in again. You can change your own password any time from the sidebar ("Change password") — doing so signs you out of every other device. Too many wrong attempts on one account pause sign-in for a few minutes.

## Owner and staff
| | Owner | Staff |
|---|---|---|
| Products, quote requests, projects | ✔ | ✔ |
| Record sales and purchases | ✔ | ✔ |
| Delete sales / purchases | ✔ | — |
| Expenses, customers, reports (profit) | ✔ | — |
| See what the shop paid (cost prices, purchase prices, profit) | ✔ | — |
| Business settings, backups, restore | ✔ | — |
| Add/remove logins, activity log | ✔ | — |

## The daily routine
1. **Bought new stock** → *Purchases* → record it. Stock goes up automatically.
2. **Sold something** → *Sales* → record it. Stock goes down automatically, the customer is saved, and you can **print the receipt** or **send it on WhatsApp** in one tap.
3. **Spent money running the shop** (transport, electricity, staff…) → *Expenses*. Do **not** record stock purchases here — they belong in Purchases, otherwise profit is counted wrongly.
4. **Someone asked for a price on the website** → it appears in *Quote requests*. Contact them, mark it *Contacted*, and use *Convert to sale* if they buy.

## Quotations, invoices and receipts (PDF)
- **Quotations** (menu → *Quotations*): build a priced offer with several items. Pick products from stock (the price fills in) or type a service such as installation. Add a discount, a "valid until" date and notes, then **PDF**, **Share PDF** or **WhatsApp** it to the customer. Each gets a number like `Q-2026-0007`.
- Straight from a website enquiry: *Quote requests → Create quotation (PDF)* fills in the customer and product for you.
- When the customer accepts, press **Convert to sales**. Every stock item becomes a real sale and stock goes down. Enter a **deposit** if they paid something. If any item is short of stock, nothing is converted and you are told which one.
- Items that aren't stock products (installation, delivery) can't become sales — bill those separately.
- **Invoices and receipts:** every sale card has **PDF**, **Share PDF** and **WhatsApp**. An invoice shows what is owed; a receipt shows what was paid.

## Customers who pay later
- On a sale that isn't fully paid, press **Record payment**: amount, how it was paid, the date, an optional note. It can never go past the amount owed. The sale becomes *Partial* and then *Paid* by itself.
- A wrongly recorded payment can be undone by an owner ("undo" under the payment).
- *Customers → open a customer → Account statement*: a PDF listing every charge and payment with a running balance, for all time or for dates you choose. The **WhatsApp** button sends a polite payment reminder with the amount owed.
- The **Overview** page lists who owes you the most.

## Stock count (checking the shelves)
*Stock count*: walk through the shop and type what you actually counted. The page shows the difference for each product as you type, then asks you to confirm before anything changes. After saving, quantities are set to your counts and each difference is recorded permanently under **History** (who, when, how many missing or extra — and for the owner, what the shortage cost). Editing a quantity directly on a product is also recorded there as a *Correction*.

## Product and project photos
- Up to **8 photos per product** and **12 per project**.
- Big phone photos are **shrunk automatically** before uploading, so they upload quickly and never fail for being too large. Only JPG, PNG and WEBP are accepted.
- Each existing photo has a red ✕ to remove it; removed photos are also deleted from storage.

## Searching, filtering and sorting
Every list (Sales, Purchases, Expenses, Customers, Products, Quote requests, Activity log) has the same tools:

- **Search box** — type one or more words. A record must match **all** of them. `john window` finds John's window sales. Words can also be a month or date: `october`, `2026-10`, `friday`.
- **Date menu** — All time, Today, This week, This month, This year, Last 30 days, *Pick a month*, or *Custom dates* (from–to, both days included).
- **Dropdowns** — for example on Sales: Category (Materials / Profiles / Accessories…), Product, Payment (Paid / Partial / Unpaid), Method.
- **Sort** — by date, amount, customer, product, quantity, balance owed… with a low→high / high→low switch.
- **Combine everything.** Example: *Category: Profiles* + *Payment: Unpaid* + *This month* + search `ada` shows only Ada's unpaid profile sales this month.
- The list says **"Showing X of Y"**, and Sales/Purchases/Expenses show the **total of what is showing**. *Clear filters* resets everything.

## Exporting and sharing
Above every list: **Excel**, **CSV** and (on phones) **Share**. They export **exactly what you are looking at**, so filter first, then export.

For whole-business exports go to *Business Settings → Backup, restore & spreadsheets*: choose a table (or "Everything" — one Excel file with a sheet for each), optionally a date range, and download or share.

Reports can be exported month-by-month, and you can pick any custom date range.

## Backup and restore (owner)
See [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

## Activity log (owner)
*Activity log* lists who recorded, changed or deleted important things and when. If a sale disappears or a price changes, look here. It never stores passwords or customer phone numbers.

## If something looks wrong
- **A stock number is off** → look in Purchases and Sales for a missing or doubled entry. Deleting a wrong entry puts the stock back. You can also correct the quantity by editing the product.
- **A customer appears twice** → phone numbers are matched in one standard format (`0806…` = `+234 806…`), so this should not happen after the one-time migration (`npm run migrate`).
- **Can't delete a product** → it already has sales or purchases. Set its status to *Out of stock* instead.
