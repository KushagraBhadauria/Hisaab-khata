import type { BalanceStyle, Book } from './types'

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })

/** Round to paise to avoid floating point drift. */
export const r2 = (n: number) => Math.round(n * 100) / 100

/** 1,28,050 or 5,447.5 */
export const num = (n: number) => inr0.format(r2(Math.abs(n)))
/** Always two decimals: 1,28,050.00 */
export const num2 = (n: number) => inr2.format(r2(Math.abs(n)))

export const MINUS = '−'

/** Balance text according to the user's chosen style. */
export function fmtBal(n: number, style: BalanceStyle, opts: { rupee?: boolean; decimals?: boolean } = {}) {
  const v = r2(n)
  const body = (opts.rupee === false ? '' : '₹') + (opts.decimals ? num2(v) : num(v))
  if (v === 0) return body
  if (style === 'drcr') return `${body} ${v < 0 ? 'Dr' : 'Cr'}`
  return v < 0 ? MINUS + body : body
}

/** Human hint under a balance: "Ankit will give", "You will give", "Settled". */
export function balHint(n: number, book?: Pick<Book, 'kind' | 'name'>) {
  const v = r2(n)
  if (v === 0) return 'Settled'
  if (!book || book.kind === 'cashbook' || book.kind === 'other') return v < 0 ? 'Dr balance' : 'Cr balance'
  const who = book.name.trim().length <= 18 ? book.name.trim() : 'Party'
  return v < 0 ? `${who} will give` : 'You will give'
}

// ---------------- dates (always local, never UTC-shifted) ----------------
export function todayISO(d = new Date()) {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const fmtDate = (s: string) => { const d = parseISO(s); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}` }
export const fmtDay = (s: string) => { const d = parseISO(s); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}` }
export const monthKey = (s: string) => s.slice(0, 7)
export const fmtMonth = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MONTH[m - 1]} ${y}` }
export const fmtLongDate = (s: string) => { const d = parseISO(s); return `${String(d.getDate()).padStart(2, '0')} ${MONTH[d.getMonth()]} ${d.getFullYear()}` }

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`
  return fmtDate(iso.slice(0, 10))
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '#'

const GRADS = [
  ['#6c5ce7', '#a29bfe'], ['#f5a524', '#f7c66b'], ['#12a150', '#5ad48f'], ['#0ea5e9', '#7dd3fc'],
  ['#e5484d', '#ff8a8e'], ['#d946ef', '#f0abfc'], ['#14b8a6', '#5eead4'], ['#f97316', '#fdba74'],
]
export function avatarBg(seed: string) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const [a, b] = GRADS[h % GRADS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
