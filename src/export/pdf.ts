import { jsPDF } from 'jspdf'
import autoTable, { type RowInput, type CellDef } from 'jspdf-autotable'
import { balHint, fmtBal, fmtDate, fmtDay, fmtLongDate, fmtMonth, num2 } from '../lib/format'
import { periodOf, type Statement } from '../lib/ledger'
import type { BalanceStyle } from '../lib/types'

const C = {
  pri: [108, 92, 231] as [number, number, number],
  priSoft: [239, 234, 253] as [number, number, number],
  ink: [30, 27, 46] as [number, number, number],
  mute: [122, 117, 144] as [number, number, number],
  line: [228, 224, 240] as [number, number, number],
  dr: [214, 54, 59] as [number, number, number],
  drBg: [255, 240, 240] as [number, number, number],
  cr: [14, 140, 69] as [number, number, number],
  crBg: [233, 249, 239] as [number, number, number],
  soft: [248, 246, 253] as [number, number, number],
}

const DEVA = /[ऀ-ॿ]/

/**
 * jsPDF cannot shape Hindi text, so the short-i matra (ि) would print after its consonant.
 * Move it in front of its consonant cluster (e.g. सरिया) so the word reads correctly.
 */
export function fixHindi(s: string) {
  if (!DEVA.test(s)) return s
  return s.replace(/((?:[क-हक़-य़]़?्)*[क-हक़-य़]़?)ि/g, 'ि$1')
}
const fontCache: Record<string, string> = {}

async function loadFont(file: string) {
  if (fontCache[file]) return fontCache[file]
  const buf = await (await fetch(`/fonts/${file}`)).arrayBuffer()
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return (fontCache[file] = btoa(bin))
}

async function addFonts(doc: jsPDF, needDeva: boolean) {
  const list: [string, string, 'normal' | 'bold'][] = [
    ['NotoSans-Regular.ttf', 'Noto', 'normal'], ['NotoSans-Bold.ttf', 'Noto', 'bold'],
  ]
  if (needDeva) list.push(['NotoSansDevanagari-Regular.ttf', 'NotoDeva', 'normal'], ['NotoSansDevanagari-Bold.ttf', 'NotoDeva', 'bold'])
  for (const [file, name, style] of list) {
    try {
      doc.addFileToVFS(file, await loadFont(file))
      doc.addFont(file, name, style)
    } catch { /* fall back to built-in Helvetica */ }
  }
  return doc.getFontList()['Noto'] ? 'Noto' : 'helvetica'
}

export async function buildPdf(st: Statement, style: BalanceStyle, owner?: string): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const needDeva = st.rows.some(r => DEVA.test(r.details)) || DEVA.test(st.book.name)
  const F = await addFonts(doc, needDeva)
  const rupee = F === 'Noto' ? '₹' : 'Rs.'
  const bal = (n: number) => fmtBal(n, style, { decimals: true, rupee: false })
  const W = doc.internal.pageSize.getWidth()
  const M = 36

  // ---------- header band ----------
  doc.setFillColor(...C.pri)
  doc.roundedRect(M, 30, W - 2 * M, 74, 12, 12, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont(needDeva && DEVA.test(st.book.name) ? 'NotoDeva' : F, 'bold')
  doc.setFontSize(19)
  doc.text(`${fixHindi(st.book.name)} Statement`, M + 18, 60)
  doc.setFont(F, 'normal')
  doc.setFontSize(10)
  const { start, end } = periodOf(st)
  const periodText = start === end ? fmtDate(start) : `${fmtDate(start)} to ${fmtDate(end)}`
  doc.text(`Statement period: ${periodText}`, M + 18, 78)
  const right = [st.book.phone ? `Phone: ${st.book.phone}` : '', owner ? `Prepared by: ${owner}` : ''].filter(Boolean)
  right.forEach((t, i) => doc.text(t, W - M - 18, 60 + i * 16, { align: 'right' }))
  doc.setFontSize(8.5)
  doc.text('Hisaab Khata', W - M - 18, 92, { align: 'right' })

  // ---------- summary boxes ----------
  const boxes: { label: string; value: string; sub: string; fill: [number, number, number]; color: [number, number, number] }[] = [
    { label: 'Opening Balance', value: fmtBal(st.opening, style, { decimals: true }).replace('₹', rupee), sub: `(on ${fmtDate(st.openingDate)})`, fill: C.soft, color: C.ink },
    { label: 'Total Debit (−)', value: `${rupee}${num2(st.totalDebit)}`, sub: 'Paid / Gave', fill: C.drBg, color: C.dr },
    { label: 'Total Credit (+)', value: `${rupee}${num2(st.totalCredit)}`, sub: 'Received / Got', fill: C.crBg, color: C.cr },
    { label: 'Net Balance', value: fmtBal(st.closing, style, { decimals: true }).replace('₹', rupee), sub: `(${balHint(st.closing, st.book)})`, fill: C.priSoft, color: st.closing < 0 ? C.dr : st.closing > 0 ? C.cr : C.ink },
  ]
  const gap = 8, bw = (W - 2 * M - gap * 3) / 4, by = 116
  boxes.forEach((b, i) => {
    const x = M + i * (bw + gap)
    doc.setFillColor(...b.fill)
    doc.setDrawColor(...C.line)
    doc.roundedRect(x, by, bw, 58, 9, 9, 'FD')
    doc.setTextColor(...C.mute); doc.setFont(F, 'normal'); doc.setFontSize(8.5)
    doc.text(b.label, x + 10, by + 16)
    doc.setTextColor(...b.color); doc.setFont(F, 'bold'); doc.setFontSize(12.5)
    doc.text(b.value, x + 10, by + 34, { maxWidth: bw - 16 })
    doc.setTextColor(...C.mute); doc.setFont(F, 'normal'); doc.setFontSize(7.5)
    doc.text(b.sub, x + 10, by + 48, { maxWidth: bw - 16 })
  })

  // period strip: "From 01 Oct 2026  To 31 Oct 2026   ·   No. of Entries: 12"
  doc.setFillColor(...C.priSoft)
  doc.roundedRect(M, by + 64, W - 2 * M, 20, 6, 6, 'F')
  doc.setTextColor(...C.pri); doc.setFont(F, 'bold'); doc.setFontSize(9.5)
  doc.text(`From: ${fmtDate(start)}     To: ${fmtDate(end)}`, M + 10, by + 77.5)
  doc.setTextColor(...C.ink); doc.setFont(F, 'normal')
  doc.text(`No. of Entries: ${st.rows.length}`, W - M - 10, by + 77.5, { align: 'right' })

  // ---------- table ----------
  const body: RowInput[] = []
  const span = (content: string, styles: CellDef['styles'] = {}): CellDef => ({ content, colSpan: 6, styles })
  body.push([{
    content: `${fmtLongDate(st.openingDate)}        (Opening Balance: ${bal(st.opening)})`, colSpan: 6,
    styles: { fillColor: C.soft, textColor: C.mute, fontStyle: 'normal', halign: 'right' },
  }])
  for (const m of st.months) {
    body.push([span(fmtMonth(m.key), { fillColor: C.priSoft, textColor: C.pri, fontStyle: 'bold' })])
    for (const r of m.rows) {
      body.push([
        String(r.serial), fmtDay(r.entry_date),
        [r.details || (r.type === 'debit' ? 'Debit' : 'Credit'), r.tag ? `[${r.tag}]` : '', r.ref_no ? `Ref: ${r.ref_no}` : ''].filter(Boolean).join('  ').replace(/^[\s\S]*$/, fixHindi),
        r.type === 'debit' ? num2(r.amount) : '',
        r.type === 'credit' ? num2(r.amount) : '',
        bal(r.balance),
      ])
    }
    body.push([
      { content: `${fmtMonth(m.key).split(' ')[0]} Total`, colSpan: 3, styles: { fontStyle: 'bold' } },
      { content: num2(m.debit), styles: { fontStyle: 'bold', textColor: C.dr } },
      { content: num2(m.credit), styles: { fontStyle: 'bold', textColor: C.cr } },
      '',
    ])
  }
  const foot: RowInput[] = [[
    { content: 'Grand Total', colSpan: 3 },
    { content: num2(st.totalDebit), styles: { textColor: C.dr } },
    { content: num2(st.totalCredit), styles: { textColor: C.cr } },
    { content: bal(st.closing) },
  ]]

  autoTable(doc, {
    startY: by + 92,
    margin: { left: M, right: M, bottom: 50 },
    head: [['#', 'Date', 'Details', 'Debit (−)', 'Credit (+)', 'Balance']],
    body, foot,
    showFoot: 'lastPage',
    theme: 'plain',
    styles: { font: F, fontSize: 9, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: C.ink, lineColor: C.line, lineWidth: { bottom: 0.6 }, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: C.pri, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9.5 },
    footStyles: { fillColor: C.ink, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 26, textColor: C.mute },
      1: { cellWidth: 48 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 74, halign: 'right', textColor: C.dr },
      4: { cellWidth: 74, halign: 'right', textColor: C.cr },
      5: { cellWidth: 86, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell(data) {
      if (data.section === 'head' && data.column.index >= 3) data.cell.styles.halign = 'right'
      if (data.section === 'foot' && data.column.index >= 3) data.cell.styles.halign = 'right'
      if (data.section === 'foot' && data.column.index === 3) data.cell.styles.textColor = [255, 160, 163]
      if (data.section === 'foot' && data.column.index === 4) data.cell.styles.textColor = [134, 239, 172]
      if (data.section === 'body' && data.column.index === 2 && needDeva && DEVA.test(String(data.cell.raw ?? ''))) data.cell.styles.font = 'NotoDeva'
      if (data.section === 'body' && data.column.index === 5 && typeof data.cell.raw === 'string' && data.cell.raw) {
        const neg = data.cell.raw.includes('Dr') || data.cell.raw.startsWith('−')
        data.cell.styles.textColor = neg ? C.dr : C.cr
      }
    },
  })

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages()
  const H = doc.internal.pageSize.getHeight()
  const stamp = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...C.line); doc.line(M, H - 34, W - M, H - 34)
    doc.setFont(F, 'normal'); doc.setFontSize(8); doc.setTextColor(...C.mute)
    doc.text(`Report generated: ${stamp}`, M, H - 20)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 20, { align: 'right' })
  }
  return doc.output('blob')
}
