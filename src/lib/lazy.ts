/**
 * Safe loading of the PDF / Excel code.
 *
 * Why: these big modules are split into separate files (e.g. assets/excel-CFwAQLEK.js).
 * Every new deploy on Vercel gives them NEW file names and the old ones disappear.
 * A tab that was opened before the deploy still asks for the OLD name → 404 →
 * "Failed to fetch dynamically imported module".
 *
 * Fix:
 *  1. Load both modules in the background right after the app opens, so the tab
 *     already has them before any new deploy can remove them.
 *  2. If loading still fails, reload the page once to pick up the latest version.
 */
const RELOAD_KEY = 'hk:chunk-reload'

export const loadPdf = () => withRecovery(() => import('../export/pdf'))
export const loadExcel = () => withRecovery(() => import('../export/excel'))

export function isChunkError(e: unknown) {
  const m = String((e as Error)?.message ?? e)
  return /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically|ChunkLoadError/i.test(m)
}

/** Reload once (not in a loop) to get the newest deployed files. */
export function reloadForUpdate(): boolean {
  if (!navigator.onLine) return false // offline: reloading would not help
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30000) return false // already tried just now — don't loop
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* storage blocked — still try once */ }
  window.location.reload()
  return true
}

async function withRecovery<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (e) {
    if (isChunkError(e)) {
      // one quick retry (network blip), then reload to the latest version
      try { return await load() } catch { /* fall through */ }
      if (reloadForUpdate()) return new Promise<T>(() => {}) // page is reloading
      throw new Error(navigator.onLine
        ? 'The app was updated. Please refresh the page and try again.'
        : 'You are offline. Connect to the internet once to enable downloads.')
    }
    throw e
  }
}

/** Warm the export code in the background once the app is idle. */
export function prefetchExports() {
  // plain import (no auto-reload here) — a background warm-up must never reload the page
  const run = () => { import('../export/pdf').catch(() => {}); import('../export/excel').catch(() => {}) }
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2500)
}
