import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { DateRangeInputs, PeriodLabel, Sheet, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { fmtBal, fmtDate, fmtDay, num } from '../lib/format'
import { defaultCustom, periodOf, RANGE_LABEL, rangeDates, statement, type CustomRange, type RangeKey } from '../lib/ledger'
import { useStore } from '../lib/store'
import type { Book, Entry } from '../lib/types'
import { canShareFiles, safeName, saveBlob } from '../export/save'

const RANGES: RangeKey[] = ['today', 'week', 'month', 'lastmonth', 'all', 'custom']

export default function ExportSheet({ book, entries, onClose }: { book: Book; entries: Entry[]; onClose(): void }) {
  const { style } = useStore()
  const { user } = useAuth()
  const toast = useToast()
  const [range, setRange] = useState<RangeKey>('month')
  const [custom, setCustom] = useState<CustomRange>(defaultCustom)
  const [fmt, setFmt] = useState<'pdf' | 'xlsx'>('pdf')
  const [busy, setBusy] = useState(false)
  const share = canShareFiles()

  const { from, to } = rangeDates(range, custom)
  const st = useMemo(() => statement(book, entries, from, to), [book, entries, from, to])
  const preview = st.rows.slice(-4)
  const period = periodOf(st)

  async function run(doShare: boolean) {
    setBusy(true)
    try {
      const blob = fmt === 'pdf'
        ? await (await import('../export/pdf')).buildPdf(st, style, user?.name)
        : await (await import('../export/excel')).buildExcel(st, style)
      const span = `${period.start}_to_${period.end}`
      const res = await saveBlob(blob, `${safeName(book.name)}_statement_${span}.${fmt}`, doShare)
      toast({ text: res === 'shared' ? 'Statement ready to share' : `${fmt === 'pdf' ? 'PDF' : 'Excel'} downloaded` })
    } catch (e) {
      toast({ text: `Could not create file: ${(e as Error).message}` })
    } finally { setBusy(false) }
  }

  return (
    <Sheet title="Download statement" onClose={onClose}>
      <div className="chips">
        {RANGES.map(r => <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
      </div>
      {range === 'custom' && <DateRangeInputs value={custom} onChange={setCustom} />}
      <PeriodLabel start={period.start} end={period.end} count={st.rows.length} />

      <div className="fmt">
        <button className={`pdf ${fmt === 'pdf' ? 'on' : ''}`} onClick={() => setFmt('pdf')}><Icon name="pdf" />PDF<small>Print-ready statement</small></button>
        <button className={`xls ${fmt === 'xlsx' ? 'on' : ''}`} onClick={() => setFmt('xlsx')}><Icon name="excel" />Excel<small>Colored .xlsx with formulas</small></button>
      </div>

      <div className="preview">
        <div className="ph">
          <span>{book.name} · Statement</span>
          <span>{fmtDate(period.start)} – {fmtDate(period.end)}</span>
        </div>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Details</th><th className="r">Debit(−)</th><th className="r">Credit(+)</th><th className="r">Balance</th></tr></thead>
          <tbody>
            <tr><td></td><td colSpan={4} className="muted">{st.openingLabel} · {fmtDay(st.openingDate)}</td><td className="r">{fmtBal(st.opening, style, { rupee: false })}</td></tr>
            {st.rows.length > preview.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>… {st.rows.length - preview.length} more entries …</td></tr>}
            {preview.map(r => (
              <tr key={r.id}>
                <td>{r.serial}</td><td>{fmtDay(r.entry_date)}</td>
                <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.details || '—'}</td>
                <td className="r red">{r.type === 'debit' ? num(r.amount) : ''}</td>
                <td className="r green">{r.type === 'credit' ? num(r.amount) : ''}</td>
                <td className="r">{fmtBal(r.balance, style, { rupee: false })}</td>
              </tr>
            ))}
            <tr className="tot"><td></td><td colSpan={2}>Grand Total ({st.rows.length})</td>
              <td className="r red">{num(st.totalDebit)}</td><td className="r green">{num(st.totalCredit)}</td>
              <td className="r">{fmtBal(st.closing, style, { rupee: false })}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button className="btn b-ink" disabled={busy} onClick={() => run(false)}>
          <Icon name="download" /> {busy ? 'Preparing…' : `Download ${fmt === 'pdf' ? 'PDF' : 'Excel'}`}
        </button>
        {share && (
          <button className="btn b-cr" disabled={busy} onClick={() => run(true)}><Icon name="share" /> Share</button>
        )}
      </div>
    </Sheet>
  )
}
