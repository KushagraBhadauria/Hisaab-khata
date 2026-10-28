import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SyncBadge } from '../components/ui'
import InstallBanner from '../components/InstallBanner'
import { useAuth } from '../lib/auth'
import { avatarBg, balHint, fmtBal, fmtDay, initials, num, todayISO, fmtLongDate } from '../lib/format'
import { bookTotals } from '../lib/ledger'
import { useStore } from '../lib/store'
import type { BookKind } from '../lib/types'
import BookForm, { KIND_LABEL } from './BookForm'

type Filter = 'all' | BookKind

export default function Home() {
  const { user } = useAuth()
  const store = useStore()
  const { books, entries, style, ready } = store
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    const byBook = new Map<string, typeof entries>()
    for (const e of entries) { const l = byBook.get(e.book_id); if (l) l.push(e); else byBook.set(e.book_id, [e]) }
    return books.filter(b => !b.archived).map(b => {
      const list = byBook.get(b.id) ?? []
      const t = bookTotals(b, list)
      const last = list.reduce((m, e) => (e.entry_date > m ? e.entry_date : m), '')
      const touched = list.reduce((m, e) => (e.updated_at > m ? e.updated_at : m), b.updated_at)
      return { book: b, count: list.length, last, touched, ...t }
    }).sort((a, b) => b.touched.localeCompare(a.touched))
  }, [books, entries])

  const kinds = useMemo(() => Array.from(new Set(rows.map(r => r.book.kind))), [rows])
  const shown = rows.filter(r =>
    (filter === 'all' || r.book.kind === filter) &&
    (!q.trim() || r.book.name.toLowerCase().includes(q.trim().toLowerCase()) || (r.book.phone ?? '').includes(q.trim())))

  const totals = rows.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit, b: a.b + r.balance }), { d: 0, c: 0, b: 0 })

  return (
    <div className="shell">
      <div className="top">
        <div className="av" style={{ background: avatarBg(user?.name ?? '') }}>{initials(user?.name ?? '')}</div>
        <div className="grow">
          <h1>Hi, {user?.name?.split(' ')[0] || 'there'}</h1>
          <small>{fmtLongDate(todayISO())}</small>
        </div>
        <SyncBadge />
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label="Settings"><Icon name="settings" /></button>
      </div>

      <div className="hero">
        <small>Net balance · {rows.length} khata{rows.length === 1 ? '' : 's'}</small>
        <div className="big">{fmtBal(totals.b, style)}</div>
        <div className="split">
          <div>Total Credit (+)<b>₹{num(totals.c)}</b></div>
          <div>Total Debit (−)<b>₹{num(totals.d)}</b></div>
        </div>
      </div>

      {store.syncError && (
        <div className="err" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{store.syncError}</span>
          <button className="link" onClick={() => store.refresh()}>Retry</button>
        </div>
      )}
      <InstallBanner />

      {rows.length > 0 && (
        <>
          <div className="search">
            <Icon name="search" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search khata by name or phone…" />
          </div>
          {kinds.length > 1 && (
            <div className="chips">
              <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
              {kinds.map(k => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{KIND_LABEL[k]}</button>)}
            </div>
          )}
        </>
      )}

      <div className="list" style={{ marginTop: rows.length ? 0 : 14 }}>
        {shown.map(r => (
          <button key={r.book.id} className="party" onClick={() => nav(`/book/${r.book.id}`)}>
            <div className="av sm" style={{ background: avatarBg(r.book.id) }}>{initials(r.book.name)}</div>
            <div className="n">
              <b>{r.book.name}</b>
              <small>{KIND_LABEL[r.book.kind]} · {r.count} entr{r.count === 1 ? 'y' : 'ies'}{r.last ? ` · ${fmtDay(r.last)}` : ''}</small>
            </div>
            <div className={`amt ${r.balance < 0 ? 'red' : r.balance > 0 ? 'green' : 'muted'}`}>
              {fmtBal(r.balance, style)}
              <small>{balHint(r.balance, r.book)}</small>
            </div>
          </button>
        ))}
        {ready && rows.length === 0 && (
          <div className="empty">
            <div className="ill"><Icon name="book" /></div>
            <b>Create your first khata</b>
            A khata can be your cash book, a customer, a supplier, a mason or staff member — make as many as you need.
          </div>
        )}
        {rows.length > 0 && shown.length === 0 && <div className="empty">No khata matches “{q}”.</div>}
      </div>

      <div className="fab">
        <button className="btn b-pri" onClick={() => setCreating(true)}><Icon name="plus" /> New Khata</button>
      </div>
      {creating && <BookForm onClose={() => setCreating(false)} onSaved={b => nav(`/book/${b.id}`)} />}
    </div>
  )
}
