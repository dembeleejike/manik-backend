# Privacy and data protection

## What is stored
| Data | Why | Who can see it |
|---|---|---|
| Customer name, phone | sales history, contacting customers | owner (Customers page); staff see them on sales they record |
| Quote requests (name, phone, notes) | following up enquiries | any logged-in admin |
| Sales, purchases, expenses, prices | running the business | sales/purchases: any admin; expenses, profit, customers, reports: owner only |
| Admin email/phone + password | signing in | owner sees the list; passwords are **hashed** and never shown |
| Activity log | accountability | owner only |

Website visitors can see only the public catalogue: names, descriptions, photos and stock **status**. They never see cost prices, selling prices or stock counts.

## How it is protected
- **Passwords** are stored as bcrypt hashes; minimum 8 characters; login attempts are rate-limited and don't reveal whether an account exists.
- **Roles are enforced on the server**, not just hidden in the screens. A removed or demoted admin loses access immediately.
- **Secure sessions.** Signing in sets a cookie that scripts on the page cannot read (`HttpOnly`), that is only sent over HTTPS and only to the same site (`Secure`, `SameSite=Strict`), and that lasts 12 hours. Every change request also carries a header that other websites cannot forge. Changing your password signs out all other devices.
- **What the shop pays is owner-only.** Cost prices, purchase prices and profit are not sent to staff accounts at all — not just hidden on screen.
- **Backups are private.** The stored copy in Cloudinary is not publicly reachable, and backup links are never returned by the API.
- **Exports and restores are owner-only**, and each is recorded in the activity log.
- **Uploads** are checked by file contents (JPG/PNG/WEBP only, 5 MB each).
- **Browser safety:** the sites send a strict Content-Security-Policy; all text from customers is escaped in emails, receipts and exports (spreadsheet "formula injection" is blocked).
- **The activity log is minimal** — short summaries only; no passwords or phone numbers.

## Good practice for the business
- Treat backup emails and spreadsheet exports as confidential: don't forward them or leave them on shared computers or public WhatsApp groups. Share a spreadsheet only with someone who needs it.
- Give staff **staff** accounts, not owner accounts; remove logins when people leave.
- Use a different strong password for the email account that receives backups, and turn on two-step verification for it.
- Customers can ask for their details to be corrected or removed; the Customers page lets the owner edit profile details, and the owner can delete a customer's quote requests.

## Retention
Records are kept until you delete them. Deleted products have their photos removed from Cloudinary. Backups you have emailed or downloaded are copies outside the system — delete old ones you no longer need.
