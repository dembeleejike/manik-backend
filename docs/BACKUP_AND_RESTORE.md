# Backup and restore

## What gets backed up
Products, categories, sales, purchases, expenses, customers, quote requests and projects.

**Not included (on purpose):** admin logins and passwords. Backups are files that get emailed around, so they never contain anyone's password.

## Three safety copies, automatically
Every night a scheduled job (`POST /api/backup/run`, protected by `BACKUP_SECRET`) creates a backup and:
1. stores it **privately** in Cloudinary (not reachable by a public link), and
2. emails **every owner account** that has an email address two files: the backup (`.json`, used to restore) and an Excel copy (`.xlsx`, to read). (`OWNER_EMAIL`, if set, is an optional extra recipient.)

If one of the two fails the other is still attempted.

## Taking a backup yourself
*Business Settings → Backup, restore & spreadsheets*
- **Download full backup** — saves the `.json` to your device.
- **Email a backup…** — type the email address to send it to and your own password (to confirm it's you), then press *Send backup*. Both files are emailed there. It is limited to 6 per hour and recorded in the activity log with the address it was sent to.

Keep backups somewhere safe (they contain private customer and money records).

## Restoring
1. *Business Settings → Restore from a backup* → choose a `.json` backup file.
2. The system **checks the file and shows a preview**: for each kind of record, how many will be updated, how many will be brought back, and how many are damaged and skipped. **Nothing has changed yet.**
3. Tick the confirmation box and press **Restore now**.

### What a restore does
- Every valid record in the file is put back, matched by its unique id: **existing records are set back to the backed-up version; records that were deleted are brought back.**
- Records created **after** the backup was taken are **left alone**. A restore never erases newer work.
- Damaged or invalid records are skipped and counted — one bad row never blocks the rest.
- Just before restoring, a **safety copy of your current data is emailed** to the owner, so even a mistaken restore can be undone by restoring that safety copy.
- The restore is recorded in the activity log.

### What a restore does not do
- It does not delete anything.
- It does not touch admin logins.
- It does not re-upload photos: product and project photos live in Cloudinary and are referenced by link, so they keep working as long as those images still exist.

## Setting up the nightly job (developer)
The schedule lives in `.github/workflows/nightly-backup.yml` (runs at 02:00 Nigerian time and retries while a sleeping host wakes up). In the GitHub repo add two Actions secrets — `API_URL` (your backend address, no trailing slash) and `BACKUP_SECRET` (same value as on the server) — then open the **Actions** tab, choose *Nightly backup* and press **Run workflow** once to test it. A green tick means the owner's inbox should have the email.

## Setting it up (developer)
Environment variables on the server: `EMAIL_USER` and `EMAIL_APP_PASSWORD` (the mailbox the system sends from — a Gmail address and an app password; recipients are chosen by people or taken from the owner accounts), `BACKUP_SECRET` (at least 16 characters; same value in the GitHub Action secret), Cloudinary keys.
After upgrading an existing database, run `npm run migrate` once.
