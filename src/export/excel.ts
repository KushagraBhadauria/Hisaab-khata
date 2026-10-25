import ExcelJS from 'exceljs'
import { balHint, fmtDate, fmtMonth, todayISO } from '../lib/format'
import { statement, type Statement } from '../lib/ledger'
import type { BalanceStyle, Book, Entry } from '../lib/types'

const PRI = 'FF6C5CE7', PRI_SOFT = 'FFEFEAFD', INK = 'FF1E1B2E', MUTE = 'FF7A7590', LINE = 'FFE4E0F0'
const DR = 'FFD6363B', DR_BG = 'FFFFF0F0', CR = 'FF0E8C45', CR_BG = 'FFE9F9EF', SOFT = 'FFF8F6FD'

/** Excel stores dates without time zone — build them in UTC so the day never shifts. */
const xdate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
const KIND: Record<string, string> = { cashbook: 'Cash Book', party: 'Party / Customer', staff: 'Staff / Labour', other: 'Other' }

const AMT = '#,##0.00'
const balFmt = (style: BalanceStyle) =>
  style === 'drcr' ? '#,##0.00 "Cr";#,##0.00 "Dr";0.00' : '#,##0.00;[Red]-#,##0.00;0.00'

const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = { style: 'thin' as const, color: { argb: LINE } }
const border: Partial<ExcelJS.Borders> = { top: thin, bottom: thin, left: thin, right: thin }

function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Khata'
  let n = base, i = 2
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 25)} (${i++})`
  used.add(n.toLowerCase())
  return n
}

/** One beautifully formatted statement sheet — same layout as the PDF. */
function addStatementSheet(wb: ExcelJS.Workbook, st: Statement, style: BalanceStyle, name: string) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .5, header: .3, footer: .3 } },
    headerFooter: { oddFooter: '&LHisaab Khata&RPage &P of &N' },
  })
  ws.columns = [
    { key: 'sn', width: 6 }, { key: 'date', width: 13 }, { key: 'details', width: 52 },
    { key: 'dr', width: 15 }, { key: 'cr', width: 15 }, { key: 'bal', width: 17 },
  ]
  const BF = balFmt(style)

  // Title
  ws.mergeCells('A1:F1')
  const t = ws.getCell('A1')
  t.value = `${st.book.name} — Statement`
  t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  t.fill = fill(PRI)
  t.alignment = { vertical: 'middle', indent: 1 }
  ws.getRow(1).height = 32
  ws.mergeCells('A2:F2')
  const end = st.to ?? st.rows.at(-1)?.entry_date ?? todayISO()
  ws.getCell('A2').value = `Period: ${fmtDate(st.from ?? st.openingDate)} – ${fmtDate(end)}${st.book.phone ? `   ·   Phone: ${st.book.phone}` : ''}   ·   Entries: ${st.rows.length}`
  ws.getCell('A2').font = { color: { argb: MUTE }, size: 10 }
  ws.getCell('A2').alignment = { indent: 1 }

  // Summary boxes (rows 4-5)
  const boxes: [string, string, string, ExcelJS.CellValue, string, string, string][] = [
    ['A4:C4', 'A5:C5', 'Opening Balance', st.opening, BF, SOFT, INK],
    ['D4', 'D5', 'Total Debit (−)', st.totalDebit, AMT, DR_BG, DR],
    ['E4', 'E5', 'Total Credit (+)', st.totalCredit, AMT, CR_BG, CR],
    ['F4', 'F5', 'Net Balance', st.closing, BF, PRI_SOFT, st.closing < 0 ? DR : st.closing > 0 ? CR : INK],
  ]
  for (const [l, v, label, value, fmt, bg, color] of boxes) {
    if (l.includes(':')) { ws.mergeCells(l); ws.mergeCells(v) }
    const lc = ws.getCell(l.split(':')[0]), vc = ws.getCell(v.split(':')[0])
    lc.value = label; lc.font = { size: 9, color: { argb: MUTE }, bold: true }; lc.fill = fill(bg); lc.alignment = { indent: 1 }
    vc.value = value; vc.numFmt = fmt; vc.font = { size: 13, bold: true, color: { argb: color } }; vc.fill = fill(bg); vc.alignment = { indent: 1, horizontal: 'left' }
  }
  ws.getRow(5).height = 22
  ws.getCell('F6').value = `(${balHint(st.closing, st.book)})`
  ws.getCell('F6').font = { size: 9, italic: true, color: { argb: MUTE } }

  // Header (row 7)
  const head = ws.getRow(7)
  head.values = ['#', 'Date', 'Details', 'Debit (−)', 'Credit (+)', 'Balance']
  head.height = 22
  head.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(PRI); c.border = border
    c.alignment = { vertical: 'middle', horizontal: Number(c.col) >= 4 ? 'right' : 'left', indent: 1 }
  })
  ws.autoFilter = 'A7:F7'

  // Opening row
  let r = 8
  const open = ws.getRow(r)
  open.values = ['', st.openingDate ? xdate(st.openingDate) : '', 'Opening Balance', null, null, st.opening]
  open.getCell(2).numFmt = 'dd mmm yyyy'
  open.getCell(6).numFmt = BF
  open.eachCell({ includeEmpty: true }, c => { c.fill = fill(SOFT); c.font = { italic: true, color: { argb: MUTE } }; c.border = border })
  open.getCell(6).font = { bold: true }
  let prevBal = `F${r}`
  const monthTotals: number[] = []

  for (const m of st.months) {
    r++
    ws.mergeCells(`A${r}:F${r}`)
    const mc = ws.getCell(`A${r}`)
    mc.value = fmtMonth(m.key)
    mc.font = { bold: true, color: { argb: PRI } }; mc.fill = fill(PRI_SOFT); mc.alignment = { indent: 1 }
    const first = r + 1
    for (const e of m.rows) {
      r++
      const row = ws.getRow(r)
      const details = [e.details || (e.type === 'debit' ? 'Debit' : 'Credit'), e.tag ? `[${e.tag}]` : '', e.ref_no ? `Ref: ${e.ref_no}` : ''].filter(Boolean).join('  ')
      row.values = [
        e.serial, xdate(e.entry_date), details,
        e.type === 'debit' ? e.amount : null, e.type === 'credit' ? e.amount : null,
        { formula: `${prevBal}-N(D${r})+N(E${r})`, result: e.balance },
      ]
      row.getCell(2).numFmt = 'dd mmm yyyy'
      row.getCell(4).numFmt = AMT; row.getCell(5).numFmt = AMT; row.getCell(6).numFmt = BF
      row.getCell(1).font = { color: { argb: MUTE } }
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      row.getCell(4).font = { color: { argb: DR }, bold: true }
      row.getCell(5).font = { color: { argb: CR }, bold: true }
      row.getCell(6).font = { bold: true, color: { argb: e.balance < 0 ? DR : CR } }
      row.getCell(4).fill = fill(e.type === 'debit' ? DR_BG : 'FFFFFFFF')
      row.getCell(5).fill = fill(e.type === 'credit' ? CR_BG : 'FFFFFFFF')
      row.eachCell({ includeEmpty: true }, c => { c.border = border; c.alignment = { ...c.alignment, vertical: 'top' } })
      prevBal = `F${r}`
    }
    const last = r
    r++
    const tr = ws.getRow(r)
    tr.values = ['', '', `${fmtMonth(m.key)} Total`,
      { formula: `SUM(D${first}:D${last})`, result: m.debit }, { formula: `SUM(E${first}:E${last})`, result: m.credit }, null]
    tr.getCell(4).numFmt = AMT; tr.getCell(5).numFmt = AMT
    tr.eachCell({ includeEmpty: true }, c => { c.font = { bold: true }; c.fill = fill(SOFT); c.border = border })
    tr.getCell(4).font = { bold: true, color: { argb: DR } }; tr.getCell(5).font = { bold: true, color: { argb: CR } }
    monthTotals.push(r)
  }

  r++
  const g = ws.getRow(r)
  const sumOf = (col: string) => (monthTotals.length ? monthTotals.map(x => `${col}${x}`).join('+') : '0')
  g.values = ['', '', 'Grand Total',
    { formula: sumOf('D'), result: st.totalDebit }, { formula: sumOf('E'), result: st.totalCredit },
    { formula: prevBal, result: st.closing }]
  g.height = 22
  g.eachCell({ includeEmpty: true }, c => { c.fill = fill(INK); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.border = border; c.alignment = { vertical: 'middle' } })
  g.getCell(4).numFmt = AMT; g.getCell(5).numFmt = AMT; g.getCell(6).numFmt = BF.replace('[Red]', '')
  g.getCell(4).font = { bold: true, color: { argb: 'FFFFA0A3' } }
  g.getCell(5).font = { bold: true, color: { argb: 'FF86EFAC' } }
  ws.pageSetup.printTitlesRow = '7:7'
  return ws
}

async function toBlob(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function newBook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Hisaab Khata'
  wb.created = new Date()
  return wb
}

export async function buildExcel(st: Statement, style: BalanceStyle): Promise<Blob> {
  const wb = newBook()
  addStatementSheet(wb, st, style, sheetName(st.book.name, new Set()))
  return toBlob(wb)
}

/** Whole account: a summary sheet + one sheet per khata. */
export async function buildAllExcel(books: Book[], entries: Entry[], style: BalanceStyle): Promise<Blob> {
  const wb = newBook()
  const used = new Set<string>(['summary'])
  const sum = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] })
  sum.columns = [{ width: 6 }, { width: 34 }, { width: 18 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 18 }]
  sum.mergeCells('A1:G1')
  sum.getCell('A1').value = 'All Khatas — Summary'
  sum.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  sum.getCell('A1').fill = fill(PRI); sum.getRow(1).height = 30
  sum.getCell('A2').value = `Generated: ${fmtDate(todayISO())}`
  sum.getCell('A2').font = { color: { argb: MUTE } }
  const h = sum.getRow(3)
  h.values = ['#', 'Khata', 'Type', 'Entries', 'Total Debit (−)', 'Total Credit (+)', 'Balance']
  h.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(PRI); c.border = border })
  let r = 3
  const sorted = [...books].sort((a, b) => a.name.localeCompare(b.name))
  sorted.forEach((b, i) => {
    const st = statement(b, entries.filter(e => e.book_id === b.id), null, null)
    const name = sheetName(b.name, used)
    addStatementSheet(wb, st, style, name)
    r++
    const row = sum.getRow(r)
    row.values = [i + 1, { text: b.name, hyperlink: `#'${name}'!A1` }, KIND[b.kind] ?? b.kind, st.rows.length, st.totalDebit, st.totalCredit, st.closing]
    row.getCell(2).font = { color: { argb: PRI }, underline: true }
    row.getCell(5).numFmt = AMT; row.getCell(6).numFmt = AMT; row.getCell(7).numFmt = balFmt(style)
    row.getCell(5).font = { color: { argb: DR } }; row.getCell(6).font = { color: { argb: CR } }
    row.getCell(7).font = { bold: true, color: { argb: st.closing < 0 ? DR : CR } }
    row.eachCell({ includeEmpty: true }, c => { c.border = border })
  })
  r++
  const t = sum.getRow(r)
  t.values = ['', 'Total', '', '', { formula: `SUM(E4:E${r - 1})` }, { formula: `SUM(F4:F${r - 1})` }, { formula: `SUM(G4:G${r - 1})` }]
  t.eachCell({ includeEmpty: true }, c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(INK) })
  t.getCell(5).numFmt = AMT; t.getCell(6).numFmt = AMT; t.getCell(7).numFmt = balFmt(style)
  return toBlob(wb)
}
