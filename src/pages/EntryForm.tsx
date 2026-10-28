import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Sheet, useToast } from '../components/ui'
import { calc, isExpression } from '../lib/calc'
import { fmtBal, num, todayISO } from '../lib/format'
import { withBalances } from '../lib/ledger'
import { useStore } from '../lib/store'
import type { Attachment, Book, Entry, EntryType, PayMode } from '../lib/types'
import { useAuth } from '../lib/auth'
import { addBill, MAX_BILLS, removeBills } from '../lib/bills'
import { uid } from '../lib/format'
import { BillThumb, BillViewer } from '../components/Bills'
import { Icon } from '../components/Icon'

const DEFAULT_TAGS: Record<EntryType, string[]> = {
  debit: ['Material', 'Labour', 'Salary', 'Purchase', 'Transport', 'Food'],
  credit: ['Received', 'Sale', 'Refund', 'Advance'],
}
const MODES: { k: PayMode; label: string }[] = [
  { k: 'cash', label: '💵 Cash' }, { k: 'upi', label: '📱 UPI' }, { k: 'bank', label: '🏦 Bank' }, { k: 'cheque', label: '🧾 Cheque' },
]

export default function EntryForm({ book, type: initialType, entry, onClose: close }: {
  book: Book
  type: EntryType
  entry?: Entry
  onClose(): void
}) {
  const store = useStore()
  const { user } = useAuth()
  // bill photos
  const [entryId, setEntryId] = useState(() => entry?.id ?? uid())
  const [atts, setAtts] = useState<Attachment[]>(entry?.attachments ?? [])
  const [added, setAdded] = useState<string[]>([])      // new this time (discard if cancelled)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [viewAt, setViewAt] = useState<number | null>(null)
  const saved = useRef(false)

  async function pickPhotos(files: FileList | null) {
    if (!files?.length || !user) return
    const room = MAX_BILLS - atts.length
    const list = Array.from(files).slice(0, room)
    if (files.length > room) toast({ text: `Only ${MAX_BILLS} photos per entry — added the first ${room}.` })
    setPhotoBusy(true)
    try {
      for (const f of list) {
        const a = await addBill(user.id, entryId, f)
        setAtts(x => [...x, a]); setAdded(x => [...x, a.path])
      }
    } catch (e) { setErr((e as Error).message) } finally { setPhotoBusy(false) }
  }
  function dropPhoto(path: string) { setAtts(x => x.filter(a => a.path !== path)) }

  /** Closing without saving: throw away photos added in this form. */
  function onClose() {
    if (!saved.current && user) removeBills(user.id, added)
    close()
  }
  const toast = useToast()
  const [type, setType] = useState<EntryType>(entry?.type ?? initialType)
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [date, setDate] = useState(entry?.entry_date ?? todayISO())
  const [details, setDetails] = useState(entry?.details ?? '')
  const [tag, setTag] = useState(entry?.tag ?? '')
  const [mode, setMode] = useState<PayMode | null>(entry?.mode ?? 'cash')
  const [ref, setRef] = useState(entry?.ref_no ?? '')
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const amtRef = useRef<HTMLInputElement>(null)

  const value = calc(amount)
  const bookEntries = store.entriesOf(book.id)

  // tags this user already uses, plus sensible defaults
  const tags = useMemo(() => {
    const used = store.entries.filter(e => e.type === type && e.tag).map(e => e.tag as string)
    return Array.from(new Set([...used, ...DEFAULT_TAGS[type]])).slice(0, 10)
  }, [store.entries, type])

  // balance right after this entry
  const after = useMemo(() => {
    if (value === null || value <= 0) return null
    const draft: Entry = {
      id: entry?.id ?? '__draft__', book_id: book.id, entry_date: date, details, type, amount: value,
      mode, tag: tag || null, ref_no: null, attachments: [], created_at: entry?.created_at ?? new Date().toISOString(), updated_at: '',
    }
    const rows = withBalances(book, [...bookEntries.filter(e => e.id !== draft.id), draft])
    return rows.find(r => r.id === draft.id)?.balance ?? null
  }, [value, date, type, book, bookEntries, entry, details, mode, tag])

  function save(again: boolean) {
    setErr('')
    if (value === null || value <= 0) { setErr('Please enter a valid amount.'); amtRef.current?.focus(); return }
    if (!date) { setErr('Please choose a date.'); return }
    if (date > todayISO()) { setErr('Future dates are not allowed. Please choose today or an earlier date.'); return }
    store.saveEntry({
      id: entryId, book_id: book.id, type, amount: value, entry_date: date,
      details: details.trim(), tag: tag || null, mode, ref_no: ref, attachments: atts,
    })
    // photos removed while editing → delete them from storage too
    const keep = new Set(atts.map(a => a.path))
    const removed = [...(entry?.attachments ?? []).map(a => a.path), ...added].filter(p => !keep.has(p))
    if (user && removed.length) removeBills(user.id, removed)
    toast({ text: `${type === 'debit' ? 'Debit' : 'Credit'} of ₹${num(value)} saved${atts.length ? ` with ${atts.length} photo${atts.length > 1 ? 's' : ''}` : ''}` })
    if (again) {
      setAmount(''); setDetails(''); setRef(''); setAtts([]); setAdded([]); setEntryId(uid()); amtRef.current?.focus()
    } else { saved.current = true; close() }
  }

  function remove() {
    if (!entry) return
    const gone = store.deleteEntry(entry.id)
    saved.current = true
    close()
    if (gone) toast({ text: 'Entry deleted', action: { label: 'UNDO', run: () => store.restoreEntry(gone) } })
  }

  const submit = (e: FormEvent) => { e.preventDefault(); save(false) }
  const isDr = type === 'debit'

  return (
    <Sheet title={`${entry ? 'Edit' : 'New'} entry · ${book.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="toggle">
          <button type="button" className={isDr ? 'on-dr' : ''} onClick={() => setType('debit')}>− Debit (Paid / Gave)</button>
          <button type="button" className={!isDr ? 'on-cr' : ''} onClick={() => setType('credit')}>+ Credit (Received / Got)</button>
        </div>

        <div className={`amtbox ${type}`}>
          <small>{isDr ? 'AMOUNT PAID (−)' : 'AMOUNT RECEIVED (+)'}</small>
          <div className="row">
            <span>₹</span>
            <input ref={amtRef} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal"
              placeholder="0" autoFocus={!entry} aria-label="Amount" />
          </div>
          <div className="eq">
            {amount && isExpression(amount) ? (value !== null ? `= ₹${num(value)}` : 'Check the calculation') : 'Tip: you can type 5447+513 or 80*68'}
          </div>
        </div>

        {err && <div className="err">{err}</div>}

        <div className="two">
          <label className="field"><span>Date</span><input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} /></label>
          <label className="field"><span>Ref / Bill no.</span><input value={ref} onChange={e => setRef(e.target.value)} placeholder="Optional" /></label>
        </div>
        <label className="field"><span>Details — why this amount?</span>
          <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={500} rows={2}
            placeholder={isDr ? 'e.g. Cash paid to Mason Satyendra, part payment Oct' : 'e.g. Amount received from Prateek'} />
        </label>

        <div className="tags">
          {tags.map(t => <button type="button" key={t} className={tag === t ? 'on' : ''} onClick={() => setTag(tag === t ? '' : t)}>{t}</button>)}
          {tag && !tags.includes(tag) && <button type="button" className="on" onClick={() => setTag('')}>{tag}</button>}
          {adding ? (
            <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Tag name" maxLength={24}
              style={{ fontSize: 12, padding: '5px 11px', borderRadius: 20, border: '1px solid var(--pri2)', background: 'var(--card)', width: 110 }}
              onBlur={() => { if (newTag.trim()) setTag(newTag.trim()); setAdding(false); setNewTag('') }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }} />
          ) : <button type="button" onClick={() => setAdding(true)}>+ tag</button>}
        </div>
        <div className="bills">
          <span className="lbl"><Icon name="clip" /> Bill photos ({atts.length}/{MAX_BILLS})</span>
          <div className="thumbs">
            {atts.map((a, i) => <BillThumb key={a.path} att={a} onOpen={() => setViewAt(i)} onRemove={() => dropPhoto(a.path)} />)}
            {atts.length < MAX_BILLS && (
              <>
                <label className={`addb ${photoBusy ? 'busy' : ''}`}>
                  <Icon name="camera" />{photoBusy ? 'Saving…' : 'Camera'}
                  <input type="file" accept="image/*" capture="environment" onChange={e => { pickPhotos(e.target.files); e.target.value = '' }} />
                </label>
                <label className={`addb ${photoBusy ? 'busy' : ''}`}>
                  <Icon name="image" />Gallery
                  <input type="file" accept="image/*" multiple onChange={e => { pickPhotos(e.target.files); e.target.value = '' }} />
                </label>
              </>
            )}
          </div>
        </div>
        {viewAt !== null && <BillViewer list={atts} start={viewAt} onClose={() => setViewAt(null)} />}

        <div className="tags">
          {MODES.map(m => <button type="button" key={m.k} className={mode === m.k ? 'on' : ''} onClick={() => setMode(mode === m.k ? null : m.k)}>{m.label}</button>)}
        </div>

        {after !== null && (
          <div className="after"><span>Balance after this entry</span><span>{fmtBal(after, store.style)}</span></div>
        )}

        <div className="actions">
          {entry ? (
            <button type="button" className="btn b-danger" onClick={() => (confirmDel ? remove() : setConfirmDel(true))}>
              {confirmDel ? 'Tap again' : 'Delete'}
            </button>
          ) : (
            <button type="button" className="btn b-ghost" onClick={() => save(true)}>Save & new</button>
          )}
          <button className={`btn ${isDr ? 'b-dr' : 'b-cr'}`} style={{ flex: 1.6 }}>
            {entry ? 'Save changes' : `Save ${isDr ? 'Debit' : 'Credit'}`}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
