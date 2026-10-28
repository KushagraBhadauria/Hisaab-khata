import { kvGet, kvKeys, kvSet } from './idb'
import { uid } from './format'
import { DEMO, supabase } from './supabase'
import type { Attachment, Entry } from './types'

/**
 * Bill / receipt photos.
 *
 * - Photos are shrunk in the phone before saving (max 1600 px, JPEG) → usually 100–300 KB each,
 *   so the free 1 GB Supabase Storage holds thousands of bills.
 * - Saved on the phone first (works offline), uploaded to the "bills" bucket when online.
 * - Stored at  bills/<user id>/<entry id>/<random>.jpg  — only the owner can upload or delete;
 *   the random file name makes the link private-by-obscurity (same idea as Khatabook),
 *   so the link inside a PDF opens for whoever you send the PDF to.
 */

export const BUCKET = 'bills'
export const MAX_BILLS = 4
const MAX_SIDE = 1600
const QUALITY = 0.72

interface FileQueue { uploads: string[]; removals: { path: string; at: number }[] }
const qKey = (user: string) => `hk:files:${user}`
const blobKey = (path: string) => `hk:blob:${path}`

async function getQueue(user: string): Promise<FileQueue> {
  return (await kvGet<FileQueue>(qKey(user))) ?? { uploads: [], removals: [] }
}
const setQueue = (user: string, q: FileQueue) => kvSet(qKey(user), q)

// ---------------- compress ----------------
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); res(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This file is not a supported image.')) }
    img.src = url
  })
}

export async function compressImage(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error('Please choose a photo (JPG or PNG).')
  }
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) // transparent PNG → white, not black
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not process this photo.'))), 'image/jpeg', QUALITY))
  return { blob, w, h }
}

// ---------------- add / remove ----------------
/** Compress, keep on the phone, and queue for upload. Returns the attachment to store on the entry. */
export async function addBill(user: string, entryId: string, file: File): Promise<Attachment> {
  const { blob, w, h } = await compressImage(file)
  const path = `${user}/${entryId}/${uid()}.jpg`
  await kvSet(blobKey(path), blob)
  const q = await getQueue(user)
  q.uploads.push(path)
  await setQueue(user, q)
  return { path, size: blob.size, w, h }
}

/** Forget photos (after a delete). Actual removal from the cloud waits a minute so UNDO still works. */
export async function removeBills(user: string, paths: string[]) {
  if (!paths.length) return
  const q = await getQueue(user)
  q.uploads = q.uploads.filter(p => !paths.includes(p))
  q.removals.push(...paths.map(path => ({ path, at: Date.now() })))
  await setQueue(user, q)
}

// ---------------- show ----------------
export function publicUrl(path: string) {
  if (DEMO || !supabase) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const urlCache = new Map<string, string>()
/** Local copy if we still have it (instant, works offline), else the cloud link. */
export async function billUrl(path: string): Promise<string> {
  const hit = urlCache.get(path)
  if (hit) return hit
  const blob = await kvGet<Blob>(blobKey(path)).catch(() => undefined)
  const url = blob instanceof Blob ? URL.createObjectURL(blob) : publicUrl(path)
  if (url) urlCache.set(path, url)
  return url
}

export async function pendingUploads(user: string) {
  return (await getQueue(user)).uploads
}

// ---------------- sync ----------------
/**
 * Upload waiting photos and delete removed ones.
 * `inUse` = every photo path still referenced by an entry (so UNDO never loses a photo).
 */
export async function syncFiles(user: string, inUse: Set<string>): Promise<void> {
  if (DEMO || !supabase) return
  const q = await getQueue(user)

  for (const path of [...q.uploads]) {
    const blob = await kvGet<Blob>(blobKey(path))
    if (blob instanceof Blob) {
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
      if (error && !/exists/i.test(error.message)) throw error
    }
    q.uploads = q.uploads.filter(p => p !== path)
    await setQueue(user, q)
  }

  const due = q.removals.filter(r => Date.now() - r.at > 60_000)
  const toDelete = due.filter(r => !inUse.has(r.path)).map(r => r.path)
  if (toDelete.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(toDelete)
    if (error) throw error
  }
  if (due.length) {
    q.removals = q.removals.filter(r => !due.includes(r))
    await setQueue(user, q)
  }
}

/** Total size of all bill photos (for the Settings screen). */
export const totalBillBytes = (entries: { attachments?: Attachment[] }[]) =>
  entries.reduce((s, e) => s + (e.attachments ?? []).reduce((a, b) => a + (b.size || 0), 0), 0)

/**
 * Find photos that belong to an entry (their file path contains the entry id) but are not
 * listed on that entry any more — e.g. saved while the database was not yet updated for photos.
 * Looks on this phone first, then in the cloud. Returns entry id → photos to add back.
 */
export async function recoverBills(user: string, entries: Entry[]): Promise<Map<string, Attachment[]>> {
  const out = new Map<string, Attachment[]>()
  const byId = new Map(entries.map(e => [e.id, e]))
  const known = new Set(entries.flatMap(e => (e.attachments ?? []).map(a => a.path)))
  const q = await getQueue(user)
  const removed = new Set(q.removals.map(r => r.path))
  const add = (path: string, size: number) => {
    const entryId = path.split('/')[1]
    const e = byId.get(entryId)
    if (!e || known.has(path) || removed.has(path)) return
    known.add(path)
    const list = out.get(entryId) ?? []
    if ((e.attachments?.length ?? 0) + list.length >= MAX_BILLS) return
    list.push({ path, size })
    out.set(entryId, list)
  }
  // 1) photos still saved on this phone
  for (const key of await kvKeys(`hk:blob:${user}/`)) {
    const path = key.slice('hk:blob:'.length)
    const blob = await kvGet<Blob>(key)
    if (blob instanceof Blob) add(path, blob.size)
  }
  // 2) photos already in the cloud
  if (!DEMO && supabase) {
    const { data: folders } = await supabase.storage.from(BUCKET).list(user, { limit: 1000 })
    for (const f of folders ?? []) {
      if (f.id || !byId.has(f.name)) continue // only entry folders of entries that still exist
      const { data: files } = await supabase.storage.from(BUCKET).list(`${user}/${f.name}`, { limit: 10 })
      for (const file of files ?? []) {
        if (file.id) add(`${user}/${f.name}/${file.name}`, Number((file.metadata as { size?: number } | null)?.size ?? 0))
      }
    }
  }
  return out
}
