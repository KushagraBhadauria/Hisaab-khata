-- =====================================================================
-- Hisaab Khata — Supabase schema
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- =====================================================================

-- ---------- Khatas (books / accounts) ----------
create table if not exists public.books (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  kind             text not null default 'party' check (kind in ('cashbook','party','staff','other')),
  phone            text,
  note             text,
  opening_balance  numeric(14,2) not null default 0,   -- negative = Dr, positive = Cr
  opening_date     date not null default current_date,
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists books_user_idx on public.books(user_id);

-- ---------- Entries (transactions) ----------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id     uuid not null references public.books(id) on delete cascade,
  entry_date  date not null default current_date,
  details     text not null default '' check (char_length(details) <= 500),
  type        text not null check (type in ('debit','credit')),  -- debit = minus, credit = plus
  amount      numeric(14,2) not null check (amount > 0),
  mode        text check (mode in ('cash','upi','bank','cheque','other')),
  tag         text,
  ref_no      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_book_idx on public.entries(book_id, entry_date, created_at);
create index if not exists entries_user_idx on public.entries(user_id);

-- ---------- keep updated_at fresh ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------- an entry must belong to a book of the same user ----------
create or replace function public.check_entry_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.books b where b.id = new.book_id and b.user_id = new.user_id) then
    raise exception 'Book does not belong to this user';
  end if;
  return new;
end $$;
drop trigger if exists entries_owner on public.entries;
create trigger entries_owner before insert or update on public.entries
  for each row execute function public.check_entry_owner();

-- ---------- Row Level Security: every user sees ONLY their own data ----------
alter table public.books   enable row level security;
alter table public.entries enable row level security;

drop policy if exists "own books" on public.books;
create policy "own books" on public.books
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Keep-alive helper (free projects pause after ~7 days idle) ----------
create or replace function public.ping() returns text language sql as $$ select 'ok' $$;
grant execute on function public.ping() to anon, authenticated;
