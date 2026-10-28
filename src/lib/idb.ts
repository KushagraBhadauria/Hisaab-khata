/** Minimal IndexedDB key-value store (falls back to localStorage, then memory). */
const DB = 'hisaab-khata'
const STORE = 'kv'
const mem = new Map<string, unknown>()
let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T | undefined>((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(key)
      q.onsuccess = () => res(q.result as T | undefined)
      q.onerror = () => rej(q.error)
    })
  } catch {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : undefined } catch { return mem.get(key) as T | undefined }
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { mem.set(key, value) }
  }
}

/** All keys that start with `prefix` (IndexedDB only). */
export async function kvKeys(prefix: string): Promise<string[]> {
  try {
    const db = await open()
    return await new Promise<string[]>((res, rej) => {
      const range = IDBKeyRange.bound(prefix, prefix + '\uffff')
      const q = db.transaction(STORE).objectStore(STORE).getAllKeys(range)
      q.onsuccess = () => res((q.result as IDBValidKey[]).map(String))
      q.onerror = () => rej(q.error)
    })
  } catch { return [] }
}

/** Safe localStorage helpers for small preferences. */
export const pref = {
  get(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback } catch { return fallback } },
  set(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* ignore */ } },
}
