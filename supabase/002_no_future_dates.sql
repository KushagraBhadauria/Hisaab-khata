-- =====================================================================
-- Hisaab Khata — update 002: block future dates in the database too
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- (The app already blocks future dates; this is a safety net.)
-- "+ 1" gives one day of slack because the server clock is in UTC
-- while India (IST) is 5½ hours ahead.
-- =====================================================================
alter table public.entries drop constraint if exists entries_no_future_date;
alter table public.entries add constraint entries_no_future_date
  check (entry_date <= current_date + 1) not valid;

alter table public.books drop constraint if exists books_no_future_opening;
alter table public.books add constraint books_no_future_opening
  check (opening_date <= current_date + 1) not valid;
