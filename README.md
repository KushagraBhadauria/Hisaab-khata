# Hisaab Khata

A simple and attractive **debit / credit ledger** (like Khatabook). Every user signs in with their own account and can create **as many khatas as they want**: a cash book, customers, suppliers, masons, staff, and so on.

- **Debit (−)** = money paid or given, shown in red. **Credit (+)** = money received, shown in green.
- Each entry has a serial no., date, details, tag, mode (Cash/UPI/Bank/Cheque) and ref no., and the app keeps a running balance.
- The amount box works as a calculator: type `5447+513` or `80*68`.
- Statements can be filtered by date: Today, This week, This month, Last month, Custom, or All time.
- **PDF download**: Khatabook-style layout with summary boxes, month groups, month totals, grand total and page numbers.
- **Excel download**: colored .xlsx with live formulas for the running balance and totals. From Settings you can also download every khata in one workbook as a backup.
- **Works offline**: entries are saved on the phone first and sync to Supabase when you're back online.
- Installable as a phone app (PWA), and ready to be wrapped for the **Play Store** with Capacitor.
- Balance can be shown with a minus sign (−97,355) or as Dr / Cr (₹97,355 Dr). Switch this in Settings.

---

## 1. Run it on your Mac

You need Node.js 20 or newer (https://nodejs.org).

```bash
cd ~/Desktop/Khatabook/hisaab-khata
npm install
npm run dev
```

Open http://localhost:5173. Until Supabase is connected, the app runs in **Demo mode** and keeps data only in this browser.

## 2. Connect Supabase (free)

1. Go to https://supabase.com, choose **New project**, pick the region **Mumbai (ap-south-1)**, and set a database password.
2. Open **SQL Editor**, choose **New query**, paste everything from `supabase/schema.sql`, and click **Run**.
   This creates the `books` and `entries` tables with Row Level Security, so each user only ever sees their own data.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. In this folder, copy `.env.example` to `.env` and paste in those two values.
5. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your live URL (step 3), or `http://localhost:5173` while testing.
   - Under **Redirect URLs**, add `http://localhost:5173/**` and your live URL with `/**` on the end.
6. *(Optional)* Under **Authentication → Providers → Email**, you can turn off "Confirm email" so people can sign in right away.
7. Restart `npm run dev`. The app now shows the Sign in / Create account screen.

Optional Google login: enable Google in **Authentication → Providers**, then set `VITE_ENABLE_GOOGLE=true` in `.env`.

## 3. Put it online (free): Vercel

1. Push this folder to a GitHub repository. The `.env` file is ignored on purpose.
2. Go to https://vercel.com, choose **Add New → Project**, and import the repository. The framework is detected as **Vite**.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then click **Deploy**.
4. Copy the URL you get (for example `https://hisaab-khata.vercel.app`) into the Supabase **Site URL** and **Redirect URLs** (step 2.5).
5. Open the URL on your phone and tap **Add to Home Screen**. It now works like an app.

Netlify and Cloudflare Pages also work, because `public/_redirects` is already included.

### Keep the free database awake
Free Supabase projects pause after about 7 days with no activity. The GitHub Action `.github/workflows/keep-supabase-awake.yml` pings the database twice a week. To turn it on, add the repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` under GitHub → Settings → Secrets → Actions.

## 4. Android app / Play Store (later)

You need Android Studio installed.

```bash
npm run android:init     # first time only: creates the android/ project
npm run android:open     # opens Android Studio → Build → Generate Signed Bundle (.aab)
npm run android:sync     # after every code change
```

- In Supabase **Redirect URLs**, also add `https://localhost/**` (the address the Android app uses internally).
- Google Play Console has a one-time fee of US $25. New personal accounts must run a **closed test with 12 testers for 14 days** before the app can be published publicly.
- On Android, PDF and Excel downloads open the share sheet, so the file can be saved to Files or sent on WhatsApp or Drive.

---

## Project structure

```
supabase/schema.sql      database tables + security rules (run once)
src/lib/store.tsx        offline-first data store + Supabase sync (outbox)
src/lib/ledger.ts        running balance, month groups, statements, date ranges
src/lib/format.ts        ₹ Indian number format, dates, Dr/Cr labels
src/lib/calc.ts          safe calculator for the amount box
src/export/pdf.ts        PDF statement (jsPDF + autotable, Noto Sans with ₹ and Hindi)
src/export/excel.ts      Excel statement (ExcelJS, colors + formulas)
src/pages/*              Home, Khata ledger, Add/Edit entry, Export, Settings, Login
```

**Balance rule:** `balance = opening + credits − debits`. A negative balance is **Dr**, a positive one is **Cr**.
For a party khata, a Dr balance means "*they will give*" and a Cr balance means "*you will give*". This is the same as Khatabook.
