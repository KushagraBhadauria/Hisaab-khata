import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEMO, supabase } from './supabase'
import { kvGet, kvSet, pref } from './idb'
import { uid } from './format'
import type { BalanceStyle, Book, Entry, OutboxOp } from './types'

/**
 * Offline-first data store.
 *  - Everything is kept locally (IndexedDB) so the app opens instantly and works without internet.
 *  - Every change is applied locally first and queued in an "outbox".
 *  - The outbox is pushed to Supabase whenever we are online; then fresh data is pulled.
 */

export type SyncState = 'local' | 'synced' | 'syncing' | 'offline' | 'error'

interface Data { books: Book[]; entries: Entry[]; outbox: OutboxOp[]; lastSync: string | null }
const EMPTY: Data = { books: [], entries: [], outbox: [], lastSync: null }

interface StoreCtx extends Data {
  ready: boolean
  sync: SyncState
  syncError: string | null
  style: BalanceStyle
  setStyle(s: BalanceStyle): void
  refresh(): Promise<void>
  saveBook(b: Partial<Book> & { name: string }): Book
  deleteBook(id: string): { book: Book; entries: Entry[] } | null
  restoreBook(snapshot: { book: Book; entries: Entry[] }): void
  saveEntry(e: Partial<Entry> & Pick<Entry, 'book_id' | 'type' | 'amount' | 'entry_date'>): Entry
  deleteEntry(id: string): Entry | null
  restoreEntry(e: Entry): void
  entriesOf(bookId: string): Entry[]
}

const Ctx = createContext<StoreCtx>(null as unknown as StoreCtx)
export const useStore = () => useContext(Ctx)

const isNetworkError = (msg?: string) => !navigator.onLine || /fetch|network|timeout|Load failed/i.test(msg ?? '')
const strip = <T extends { user_id?: string }>(row: T) => { const { user_id: _u, ...rest } = row; void _u; return rest }

/** Apply queued (not yet uploaded) changes on top of server data. */
function applyOutbox(d: Pick<Data, 'books' | 'entries'>, outbox: OutboxOp[]) {
  let books = [...d.books], entries = [...d.entries]
  for (const op of outbox) {
    if (op.op === 'upsert' && op.table === 'books') { books = books.filter(b => b.id !== op.row.id); books.push(op.row) }
    else if (op.op === 'upsert' && op.table === 'entries') { entries = entries.filter(e => e.id !== op.row.id); entries.push(op.row) }
    else if (op.op === 'delete' && op.table === 'books') { books = books.filter(b => b.id !== op.id); entries = entries.filter(e => e.book_id !== op.id) }
    else if (op.op === 'delete' && op.table === 'entries') entries = entries.filter(e => e.id !== op.id)
  }
  return { books, entries }
}

/** Keep only the latest change per row. */
function enqueue(outbox: OutboxOp[], op: OutboxOp): OutboxOp[] {
  const id = op.op === 'delete' ? op.id : op.row.id
  const idx = outbox.findIndex(o => (o.op === 'delete' ? o.id : o.row.id) === id)
  // replace an earlier upsert in place, so a book is always uploaded before its entries
  if (idx >= 0 && op.op === 'upsert' && outbox[idx].op === 'upsert') {
    const next = [...outbox]; next[idx] = op; return next
  }
  const rest = outbox.filter(o => (o.op === 'delete' ? o.id : o.row.id) !== id)
  return [...rest, op]
}

async function fetchAll<T>(table: 'books' | 'entries'): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase!.from(table).select('*').order('id').range(from, from + size - 1)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < size) break
  }
  return out
}

const normBook = (b: Book): Book => ({ ...b, opening_balance: Number(b.opening_balance) })
const normEntry = (e: Entry): Entry => ({ ...e, amount: Number(e.amount) })

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const KEY = `hk:data:${userId}`
  const [data, setData] = useState<Data>(EMPTY)
  const [ready, setReady] = useState(false)
  const [sync, setSync] = useState<SyncState>(DEMO ? 'local' : 'syncing')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [style, setStyleState] = useState<BalanceStyle>(() => (pref.get('hk:style', 'sign') as BalanceStyle))
  const ref = useRef(data)
  const busy = useRef(false)
  const lastPull = useRef(0)

  const commit = useCallback((next: Data) => {
    ref.current = next
    setData(next)
    kvSet(KEY, next)
  }, [KEY])

  const pushAndPull = useCallback(async () => {
    if (DEMO || !supabase || busy.current) return
    busy.current = true
    setSync('syncing')
    try {
      // 1) push outbox
      while (ref.current.outbox.length) {
        const op = ref.current.outbox[0]
        const res = op.op === 'delete'
          ? await supabase.from(op.table).delete().eq('id', op.id)
          : await supabase.from(op.table).upsert(strip(op.row as Book & Entry))
        if (res.error) {
          if (isNetworkError(res.error.message)) throw res.error
          // invalid change (e.g. validation) — drop it so the queue never gets stuck
          setSyncError(`Could not save a change: ${res.error.message}`)
        }
        const cur = ref.current
        commit({ ...cur, outbox: cur.outbox.filter(o => o !== op) })
      }
      // 2) pull fresh copy
      const [books, entries] = await Promise.all([fetchAll<Book>('books'), fetchAll<Entry>('entries')])
      const cur = ref.current
      const merged = applyOutbox({ books: books.map(normBook), entries: entries.map(normEntry) }, cur.outbox)
      commit({ ...cur, ...merged, lastSync: new Date().toISOString() })
      lastPull.current = Date.now()
      setSync('synced')
    } catch (err) {
      const msg = (err as Error)?.message
      if (isNetworkError(msg)) setSync('offline')
      else { setSync('error'); setSyncError(msg) }
    } finally {
      busy.current = false
    }
  }, [commit])

  // load cache, then sync
  useEffect(() => {
    let alive = true
    kvGet<Data>(KEY).then(cached => {
      if (!alive) return
      const d = cached ? { ...EMPTY, ...cached } : EMPTY
      ref.current = d
      setData(d)
      setReady(true)
      pushAndPull()
    })
    return () => { alive = false }
  }, [KEY, pushAndPull])

  // re-sync when the internet comes back or the app is reopened
  useEffect(() => {
    if (DEMO) return
    const onOnline = () => pushAndPull()
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - lastPull.current > 20000) pushAndPull() }
    const onOffline = () => setSync('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [pushAndPull])

  const change = useCallback((fn: (d: Data) => Data) => {
    commit(fn(ref.current))
    if (!DEMO) setTimeout(pushAndPull, 0)
  }, [commit, pushAndPull])

  const api = useMemo<StoreCtx>(() => {
    const queue = (d: Data, op: OutboxOp) => (DEMO ? d.outbox : enqueue(d.outbox, op))
    return {
      ...data, ready, sync, syncError, style,
      setStyle(s) { pref.set('hk:style', s); setStyleState(s) },
      refresh: () => { setSyncError(null); return pushAndPull() },
      entriesOf: (bookId: string) => data.entries.filter(e => e.book_id === bookId),

      saveBook(input) {
        const now = new Date().toISOString()
        const prev = input.id ? ref.current.books.find(b => b.id === input.id) : undefined
        const book: Book = {
          id: input.id ?? uid(),
          name: input.name.trim(),
          kind: input.kind ?? prev?.kind ?? 'party',
          phone: input.phone ?? prev?.phone ?? null,
          note: input.note ?? prev?.note ?? null,
          opening_balance: Number(input.opening_balance ?? prev?.opening_balance ?? 0),
          opening_date: input.opening_date ?? prev?.opening_date ?? now.slice(0, 10),
          archived: input.archived ?? prev?.archived ?? false,
          created_at: prev?.created_at ?? now,
          updated_at: now,
        }
        change(d => ({
          ...d,
          books: [...d.books.filter(b => b.id !== book.id), book],
          outbox: queue(d, { op: 'upsert', table: 'books', row: book }),
        }))
        return book
      },

      deleteBook(id) {
        const book = ref.current.books.find(b => b.id === id)
        if (!book) return null
        const entries = ref.current.entries.filter(e => e.book_id === id)
        change(d => ({
          ...d,
          books: d.books.filter(b => b.id !== id),
          entries: d.entries.filter(e => e.book_id !== id),
          outbox: queue({ ...d, outbox: d.outbox.filter(o => !(o.op === 'upsert' && o.table === 'entries' && o.row.book_id === id)) }, { op: 'delete', table: 'books', id }),
        }))
        return { book, entries }
      },

      restoreBook({ book, entries }) {
        change(d => {
          let outbox = queue(d, { op: 'upsert', table: 'books', row: book })
          if (!DEMO) for (const e of entries) outbox = enqueue(outbox, { op: 'upsert', table: 'entries', row: e })
          return { ...d, books: [...d.books, book], entries: [...d.entries, ...entries], outbox }
        })
      },

      saveEntry(input) {
        const now = new Date().toISOString()
        const prev = input.id ? ref.current.entries.find(e => e.id === input.id) : undefined
        const entry: Entry = {
          id: input.id ?? uid(),
          book_id: input.book_id,
          entry_date: input.entry_date,
          details: (input.details ?? '').trim(),
          type: input.type,
          amount: Math.round(Number(input.amount) * 100) / 100,
          mode: input.mode ?? null,
          tag: input.tag?.trim() || null,
          ref_no: input.ref_no?.trim() || null,
          created_at: prev?.created_at ?? now,
          updated_at: now,
        }
        change(d => ({
          ...d,
          entries: [...d.entries.filter(e => e.id !== entry.id), entry],
          outbox: queue(d, { op: 'upsert', table: 'entries', row: entry }),
        }))
        return entry
      },

      deleteEntry(id) {
        const e = ref.current.entries.find(x => x.id === id)
        if (!e) return null
        change(d => ({ ...d, entries: d.entries.filter(x => x.id !== id), outbox: queue(d, { op: 'delete', table: 'entries', id }) }))
        return e
      },

      restoreEntry(e) {
        change(d => ({ ...d, entries: [...d.entries.filter(x => x.id !== e.id), e], outbox: queue(d, { op: 'upsert', table: 'entries', row: e }) }))
      },
    }
  }, [data, ready, sync, syncError, style, change, pushAndPull])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
