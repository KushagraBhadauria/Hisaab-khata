/** Download a file, or open the phone's share sheet (WhatsApp, Gmail, Drive…) when asked. */
export async function saveBlob(blob: Blob, filename: string, share = false): Promise<'shared' | 'downloaded'> {
  // Android app (Capacitor): save the file, then open the share sheet (WhatsApp, Drive, Files…)
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const data = await blobToBase64(blob)
    const res = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or share statement' })
    return 'shared'
  }
  if (share) {
    const file = new File([blob], filename, { type: blob.type })
    const nav = navigator as Navigator & { canShare?(d: ShareData): boolean }
    if (nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'shared'
      }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}

export const canShareFiles = () => {
  try {
    if ((window as unknown as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.()) return false
    const nav = navigator as Navigator & { canShare?(d: ShareData): boolean }
    return !!nav.canShare?.({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })
  } catch { return false }
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'khata'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}
