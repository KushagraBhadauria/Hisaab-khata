/**
 * Tiny safe calculator for the amount box, so users can type "5447+513" or "80*68".
 * Supports + - * / ( ) and decimals. Commas and ₹ are ignored. No eval().
 * Returns null when the expression is invalid.
 */
export function calc(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '').replace(/[×xX]/g, '*').replace(/÷/g, '/')
  if (!s) return null
  if (!/^[0-9+\-*/().]+$/.test(s)) return null
  let i = 0
  const peek = () => s[i]
  function number(): number {
    const m = /^\d*\.?\d+|^\d+\./.exec(s.slice(i))
    if (!m) throw new Error('num')
    i += m[0].length
    return parseFloat(m[0])
  }
  function factor(): number {
    if (peek() === '-') { i++; return -factor() }
    if (peek() === '+') { i++; return factor() }
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error(')'); i++; return v }
    return number()
  }
  function term(): number {
    let v = factor()
    while (peek() === '*' || peek() === '/') {
      const op = s[i++]
      const r = factor()
      if (op === '/' && r === 0) throw new Error('div0')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function expr(): number {
    let v = term()
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r }
    return v
  }
  try {
    const v = expr()
    if (i !== s.length || !isFinite(v)) return null
    return Math.round(v * 100) / 100
  } catch { return null }
}

export const isExpression = (s: string) => /[+\-*/×÷()]/.test(s.replace(/^[-+]/, ''))
