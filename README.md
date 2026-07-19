# Wedding Book 💍

A wedding planning web app for couples and their helpers — guest lists, RSVPs, catering headcounts, budget tracking, gift money, and a guest-facing check-in kiosk. Built for Malaysian weddings (RM currency, WhatsApp invitations, DuitNow QR gifts) but usable anywhere.

**Live app:** https://wedding-book.aaronraj.workers.dev

## How it's used

Each wedding gets its own **wedding code** (like a private room name). Opening the site the first time asks you to create a wedding or enter a code. A wedding has four planner roles, each with its own passcode:

| Role | Access |
|---|---|
| Bride / Groom | Everything — guests, catering, budget, gifts, data tools |
| Bride's / Groom's Accountant | Their side's guest list, RSVPs, and gift money |

Deep-link a specific wedding with `?w=<code>` — e.g. `https://wedding-book.aaronraj.workers.dev?w=aaron-joan`. Guests use the locked kiosk links (`&p=rsvp` / `&p=checkin`) to reply to their invitation or check in on the day, including an optional cash/QR monetary gift pledge.

## Features

- **Live sync** — edits appear on everyone's screen in real time (Firestore listeners)
- **Guests & RSVP** — invites with pax and baby counts, per-event tagging, editable cards, nested family-tree view (use `/` in a group name: `Dad's family / Uncle Ravi's family`), group autocomplete, duplicate-name protection, Excel/CSV import
- **RSVP by link** — guests reply themselves via `?w=<code>&p=rsvp` (also the `{rsvp}` placeholder in invitation messages); their answer updates the guest list directly
- **WhatsApp invitations** — personalised message template with a one-tap send queue
- **Catering** — eating-pax headcount (babies excluded) per event with a buffer %, per-table vs per-head quote comparison
- **Budget** — vendors by category and event, budgeted/total/paid tracking, due dates with overdue flags, refundable deposits
- **Gift money** — record angpow per guest plus off-list gifts, split by side; guest check-in pledges shown for reconciliation
- **Guest check-in kiosk** — arrival headcount tallied against RSVPs (mismatches flagged red), cash/QR gift flow showing the couple's uploaded QR image (`?w=<code>&p=checkin`)
- **Day-of dashboard** — live arrivals vs expected, awaited list, pledge totals, undo check-in
- **To-do checklist** — tasks with due dates, assignees, overdue flags, and progress
- **Data tools** — Excel workbook export (Guests, Budget, Other Gifts, Caterers, To-dos), JSON backup/restore, gift-QR upload
- **Master control** — hidden admin panel (see the `Admin` link on the wedding-code screen): every registered wedding with live stats, last activity, backup download, archive, delete, and full-access entry
- **PWA** — installable with app icon ("Add to Home Screen"), light/dark theme, mobile-friendly

## Architecture

**Svelte 5 + Vite** (rewritten July 2026 from the original single-file React app):

- **`app/`** — the application: `src/lib/` (pure helpers + Firebase storage adapter), `src/stores/` (theme, session, and the wedding data store with debounced saves + live sync), `src/components/`, `src/screens/` (Gate, Login, Planner, kiosks, AdminPanel), `src/tabs/` (the eight planner tabs).
- **`deploy/`** — the built output (`cd app && npm run build`); this folder is what gets published.
- **`wedding-planner.jsx`** / **`index.html`** (repo root) — the retired legacy React app, kept as reference/rollback.
- **Storage** — Firebase Firestore (project `wedding-planner-992a3`), anonymous auth. All docs live in the `kv` collection as `{ value: <JSON string> }`:
  - `w:<code>:data` — one wedding's full planning data
  - `w:<code>:accounts` — that wedding's role passcode hashes
  - `w:<code>:meta` — registration record (couple, created date)
  - `registry` — list of all weddings, read by master control
- Sessions, theme, and last-opened wedding stay in `localStorage` per device.

After editing anything under `app/src/`, rebuild with `cd app && npm run build` — Vite outputs straight into `deploy/`. Dev server: `npm run dev` in `app/` (port 5173).

## Firebase setup (for a fresh deployment)

1. Create a Firebase project, add a **web app**, and paste its config into the `firebaseConfig` object in `index.html`
2. **Authentication → Sign-in method → enable Anonymous**
3. **Firestore Database → create**, then publish these rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /kv/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Deploying

Hosted on Cloudflare Workers (static assets). The repo is connected to Cloudflare Builds: every push to `main` runs `npx wrangler deploy`, which publishes the `deploy/` folder per `wrangler.jsonc`.

## Security model (honest version)

This is a trust-your-team app, not a bank. Everything runs client-side: wedding codes act as space keys, role passcodes and admin credentials are stored as light hashes (not plain text, but not strong cryptography either), and the Firestore rules let any anonymous visitor of the app read/write the `kv` collection. Fine for family and friends planning a wedding; if it ever becomes a public product, move to real server-side auth (Firebase email accounts + per-wedding membership rules).
