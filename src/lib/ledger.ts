import { monthKey, r2, todayISO } from './format'
import type { Book, Entry } from './types'

export interface Row extends Entry {
  serial: number
  balance: number
}
export interface MonthGroup {
  key: string // yyyy-mm
  rows: Row[]
  debit: number
  credit: number
}
export interface Statement {
  book: Book
  from: string | null
  to: string | null
  /** Balance at the start of the period (book opening + everything before `from`). */
  opening: number
  openingDate: string
  rows: Row[]
  months: MonthGroup[]
  totalDebit: number
  totalCredit: number
  closing: number
}

/** Chronological order: date, then time of creation. */
export const sortEntries = (list: Entry[]) =>
  [...list].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at))

export const signed = (e: Pick<Entry, 'type' | 'amount'>) => (e.type === 'credit' ? e.amount : -e.amount)

/** Every entry of a book with serial number and running balance. */
export function withBalances(book: Book, entries: Entry[]): Row[] {
  let paise = Math.round(book.opening_balance * 100)
  return sortEntries(entries).map((e, i) => {
    paise += Math.round(signed(e) * 100)
    return { ...e, serial: i + 1, balance: paise / 100 }
  })
}

export function bookTotals(book: Book, entries: Entry[]) {
  let d = 0, c = 0
  for (const e of entries) e.type === 'debit' ? (d += Math.round(e.amount * 100)) : (c += Math.round(e.amount * 100))
  return { debit: d / 100, credit: c / 100, balance: r2(book.opening_balance + (c - d) / 100) }
}

export function statement(book: Book, entries: Entry[], from: string | null, to: string | null): Statement {
  const all = withBalances(book, entries)
  const before = from ? all.filter(r => r.entry_date < from) : []
  const opening = before.length ? before[before.length - 1].balance : book.opening_balance
  const rows = all.filter(r => (!from || r.entry_date >= from) && (!to || r.entry_date <= to))
  const months: MonthGroup[] = []
  let td = 0, tc = 0
  for (const r of rows) {
    const k = monthKey(r.entry_date)
    let g = months[months.length - 1]
    if (!g || g.key !== k) { g = { key: k, rows: [], debit: 0, credit: 0 }; months.push(g) }
    g.rows.push(r)
    const p = Math.round(r.amount * 100)
    if (r.type === 'debit') { g.debit = r2(g.debit + r.amount); td += p } else { g.credit = r2(g.credit + r.amount); tc += p }
  }
  const closing = rows.length ? rows[rows.length - 1].balance : opening
  return {
    book, from, to, opening,
    openingDate: from ?? book.opening_date,
    rows, months, totalDebit: td / 100, totalCredit: tc / 100, closing,
  }
}

// ---------------- quick date ranges ----------------
export type RangeKey = 'all' | 'today' | 'week' | 'month' | 'lastmonth' | 'custom'
export const RANGE_LABEL: Record<RangeKey, string> = {
  all: 'All time', today: 'Today', week: 'This week', month: 'This month', lastmonth: 'Last month', custom: 'Custom',
}
export function rangeDates(k: RangeKey, custom?: { from: string; to: string }): { from: string | null; to: string | null } {
  const now = new Date()
  const today = todayISO(now)
  switch (k) {
    case 'today': return { from: today, to: today }
    case 'week': {
      const d = new Date(now); const day = (d.getDay() + 6) % 7 // Monday start
      d.setDate(d.getDate() - day)
      return { from: todayISO(d), to: today }
    }
    case 'month': return { from: todayISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
    case 'lastmonth': return {
      from: todayISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: todayISO(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
    case 'custom': return { from: custom?.from || null, to: custom?.to || null }
    default: return { from: null, to: null }
  }
}
