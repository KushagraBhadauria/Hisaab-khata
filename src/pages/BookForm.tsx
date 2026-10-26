import { useState, type FormEvent } from 'react'
import { Sheet } from '../components/ui'
import { calc } from '../lib/calc'
import { num, todayISO } from '../lib/format'
import { useStore } from '../lib/store'
import type { Book, BookKind } from '../lib/types'

export const KIND_LABEL: Record<BookKind, string> = { cashbook: 'Cash Book', party: 'Party / Customer', staff: 'Staff / Labour', other: 'Other' }

export default function BookForm({ book, onClose, onSaved, onDelete }: {
  book?: Book
  onClose(): void
  onSaved?(b: Book): void
  onDelete?(): void
}) {
  const { saveBook } = useStore()
  const [name, setName] = useState(book?.name ?? '')
  const [kind, setKind] = useState<BookKind>(book?.kind ?? 'party')
  const [phone, setPhone] = useState(book?.phone ?? '')
  const [note, setNote] = useState(book?.note ?? '')
  const [openAmt, setOpenAmt] = useState(book && book.opening_balance ? num(book.opening_balance).replace(/,/g, '') : '')
  const [openSide, setOpenSide] = useState<'dr' | 'cr'>(book && book.opening_balance > 0 ? 'cr' : 'dr')
  const [openDate, setOpenDate] = useState(book?.opening_date ?? todayISO())
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setErr('Please give this khata a name.')
    const amt = openAmt.trim() ? calc(openAmt) : 0
    if (amt === null || amt < 0) return setErr('Opening balance must be a valid amount.')
    if (!openDate) return setErr('Please choose the opening balance date.')
    if (openDate > todayISO()) return setErr('Future dates are not allowed for the opening balance.')
    const saved = saveBook({
      id: book?.id, name, kind, phone: phone.trim() || null, note: note.trim() || null,
      opening_balance: openSide === 'dr' ? -amt : amt, opening_date: openDate,
    })
    onSaved?.(saved)
    onClose()
  }

  return (
    <Sheet title={book ? 'Edit khata' : 'New khata'} onClose={onClose}>
      <form onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <label className="field"><span>Khata name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site Cash Book, Ankit, Mason Vinod" autoFocus={!book} maxLength={80} />
        </label>
        <div className="tags">
          {(Object.keys(KIND_LABEL) as BookKind[]).map(k => (
            <button type="button" key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="field"><span>Phone (optional)</span>
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" />
        </label>
        <div className="two">
          <label className="field"><span>Opening balance</span>
            <input value={openAmt} onChange={e => setOpenAmt(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
          <label className="field"><span>As on date</span>
            <input type="date" value={openDate} max={todayISO()} onChange={e => setOpenDate(e.target.value)} />
          </label>
        </div>
        <div className="toggle">
          <button type="button" className={openSide === 'dr' ? 'on-dr' : ''} onClick={() => setOpenSide('dr')}>− Debit / Dr (minus)</button>
          <button type="button" className={openSide === 'cr' ? 'on-cr' : ''} onClick={() => setOpenSide('cr')}>+ Credit / Cr (plus)</button>
        </div>
        <label className="field"><span>Note (optional)</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Anything to remember" />
        </label>
        <div className="actions">
          {book && onDelete && (
            <button type="button" className="btn b-danger" onClick={() => (confirmDel ? onDelete() : setConfirmDel(true))}>
              {confirmDel ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
          <button className="btn b-pri">{book ? 'Save changes' : 'Create khata'}</button>
        </div>
      </form>
    </Sheet>
  )
}
