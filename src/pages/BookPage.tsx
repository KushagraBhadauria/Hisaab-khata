import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { DateRangeInputs, PeriodLabel, useToast } from '../components/ui'
import { avatarBg, balHint, fmtBal, fmtDate, fmtDay, fmtMonth, initials, num } from '../lib/format'
import { defaultCustom, periodOf, RANGE_LABEL, rangeDates, statement, type CustomRange, type RangeKey } from '../lib/ledger'
import { useStore } from '../lib/store'
import type { Attachment, Entry, EntryType } from '../lib/types'
import { BillViewer } from '../components/Bills'
import BookForm, { KIND_LABEL } from './BookForm'
import EntryForm from './EntryForm'
import ExportSheet from './ExportSheet'

const RANGES: RangeKey[] = ['all', 'month', 'lastmonth', 'week', 'today', 'custom']
const MODE_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank', cheque: 'Cheque', other: 'Other' }

export default function BookPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const store = useStore()
  const toast = useToast()
  const book = store.books.find(b => b.id === id)
  const [range, setRange] = useState<RangeKey>('all')
  const [custom, setCustom] = useState<CustomRange>(defaultCustom)
  const [q, setQ] = useState('')
  const [newest, setNewest] = useState(true)
  const [adding, setAdding] = useState<EntryType | null>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [editBook, setEditBook] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewing, setViewing] = useState<Attachment[] | null>(null)

  const entries = useMemo(() => store.entries.filter(e => e.book_id === id), [store.entries, id])
  const { from, to } = rangeDates(range, custom)
  const st = useMemo(() => (book ? statement(book, entries, from, to) : null), [book, entries, from, to])

  if (!store.ready) return <div className="spinner" />
  if (!book || !st) {
    return (
      <div className="shell">
        <div className="empty"><b>Khata not found</b>It may have been deleted.<br /><br />
          <button className="btn b-pri" onClick={() => nav('/')}>Go home</button></div>
      </div>
    )
  }

  const ql = q.trim().toLowerCase()
  const match = (e: Entry) => !ql || e.details.toLowerCase().includes(ql) || (e.tag ?? '').toLowerCase().includes(ql) ||
    String(e.amount).includes(ql) || (e.ref_no ?? '').toLowerCase().includes(ql)
  const months = st.months
    .map(m => ({ ...m, rows: (newest ? [...m.rows].reverse() : m.rows).filter(match) }))
    .filter(m => m.rows.length)
  if (newest) months.reverse()
  const style = store.style
  const allTime = range === 'all'

  function removeBook() {
    const snap = store.deleteBook(book!.id)
    setEditBook(false)
    nav('/')
    if (snap) toast({ text: `“${snap.book.name}” deleted`, action: { label: 'UNDO', run: () => store.restoreBook(snap) } })
  }

  return (
    <div className="shell">
      <div className="top">
        <button className="iconbtn" onClick={() => nav('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="av sm" style={{ background: avatarBg(book.id) }}>{initials(book.name)}</div>
        <div className="grow">
          <h1>{book.name}</h1>
          <small>{KIND_LABEL[book.kind]}{book.phone ? ` · ${book.phone}` : ''}</small>
        </div>
        <button className="iconbtn" onClick={() => setExporting(true)} aria-label="Download statement"><Icon name="download" /></button>
        <button className="iconbtn" onClick={() => setEditBook(true)} aria-label="Edit khata"><Icon name="edit" /></button>
      </div>

      <div className="sum">
        <div>{st.carried ? `Balance B/F (${fmtDay(st.openingDate)})` : `Opening (${fmtDay(st.openingDate)})`}<b>{fmtBal(st.opening, style)}</b></div>
        <div className="bal">{allTime ? 'Net balance' : 'Closing balance'}
          <b className={st.closing < 0 ? 'red' : st.closing > 0 ? 'green' : ''}>{fmtBal(st.closing, style)}</b>
          <small>{balHint(st.closing, book)}</small>
        </div>
        <div className="d">Total Debit (−)<b className="red">₹{num(st.totalDebit)}</b></div>
        <div className="c">Total Credit (+)<b className="green">₹{num(st.totalCredit)}</b></div>
      </div>

      <div className="chips">
        {RANGES.map(r => <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
        <button className="chip" onClick={() => setNewest(!newest)}>{newest ? '↓ Newest first' : '↑ Oldest first'}</button>
      </div>
      {range === 'custom' && <DateRangeInputs value={custom} onChange={setCustom} />}
      <PeriodLabel {...periodOf(st)} count={st.rows.length} />
      {entries.length > 4 && (
        <div className="search" style={{ marginTop: 0 }}>
          <Icon name="search" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search details, tag, amount…" />
        </div>
      )}

      {!newest && <div className="opening"><span>{st.openingLabel} · {fmtDate(st.openingDate)}</span><b>{fmtBal(st.opening, style)}</b></div>}

      {months.map(m => (
        <section key={m.key}>
          <div className="month">
            <span>{fmtMonth(m.key)}</span>
            <span><span className="red">−{num(m.debit)}</span> · <span className="green">+{num(m.credit)}</span></span>
          </div>
          {m.rows.map(r => (
            <button key={r.id} className={`tx ${r.type}`} onClick={() => setEditing(r)}>
              <div className="t">
                <div className="d">{r.details || <span className="muted">{r.type === 'debit' ? 'Debit' : 'Credit'} entry</span>}</div>
                <div className={`pill ${r.type === 'debit' ? 'red' : 'green'}`}>{r.type === 'debit' ? '−' : '+'}{num(r.amount)}</div>
              </div>
              <div className="m">
                <span>#{r.serial} · {fmtDay(r.entry_date)}{r.mode ? ` · ${MODE_LABEL[r.mode]}` : ''}{r.tag && <span className="tag">{r.tag}</span>}
                  {r.attachments?.length > 0 && (
                    <span className="billchip" role="button" tabIndex={0} title="View bill photos"
                      onClick={e => { e.stopPropagation(); setViewing(r.attachments) }}>
                      <Icon name="image" />{r.attachments.length}
                    </span>
                  )}</span>
                <span>Bal {fmtBal(r.balance, style, { rupee: false })}</span>
              </div>
            </button>
          ))}
        </section>
      ))}

      {newest && st.rows.length > 0 && <div className="opening" style={{ marginTop: 10 }}><span>{st.openingLabel} · {fmtDate(st.openingDate)}</span><b>{fmtBal(st.opening, style)}</b></div>}

      {entries.length === 0 && (
        <div className="empty">
          <div className="ill"><Icon name="wallet" /></div>
          <b>No entries yet</b>
          Tap <b className="red" style={{ display: 'inline' }}>− Debit</b> when you pay or give money, and <b className="green" style={{ display: 'inline' }}>+ Credit</b> when you receive it.
        </div>
      )}
      {entries.length > 0 && months.length === 0 && <div className="empty">No entries {q ? `match “${q}”` : 'in this period'}.</div>}

      <div className="fab">
        <button className="btn b-dr" onClick={() => setAdding('debit')}><Icon name="minus" /> Debit</button>
        <button className="btn b-cr" onClick={() => setAdding('credit')}><Icon name="plus" /> Credit</button>
      </div>

      {adding && <EntryForm book={book} type={adding} onClose={() => setAdding(null)} />}
      {editing && <EntryForm book={book} type={editing.type} entry={editing} onClose={() => setEditing(null)} />}
      {editBook && <BookForm book={book} onClose={() => setEditBook(false)} onDelete={removeBook} />}
      {viewing && <BillViewer list={viewing} onClose={() => setViewing(null)} />}
      {exporting && <ExportSheet book={book} entries={entries} onClose={() => setExporting(false)} />}
    </div>
  )
}
