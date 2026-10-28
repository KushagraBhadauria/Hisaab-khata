import { useEffect, useRef, useState } from 'react'
import { billUrl } from '../lib/bills'
import type { Attachment } from '../lib/types'
import { Icon } from './Icon'
import { saveBlob } from '../export/save'

/** Small square preview of one bill photo. */
export function BillThumb({ att, onOpen, onRemove }: { att: Attachment; onOpen(): void; onRemove?(): void }) {
  const [src, setSrc] = useState('')
  const [bad, setBad] = useState(false)
  useEffect(() => { let on = true; setBad(false); billUrl(att.path).then(u => on && setSrc(u)); return () => { on = false } }, [att.path])
  return (
    <div className="thumb">
      <button type="button" className="img" onClick={onOpen} aria-label="View bill photo">
        {src && !bad ? <img src={src} alt="Bill" loading="lazy" onError={() => setBad(true)} /> : <Icon name="image" />}
      </button>
      {onRemove && <button type="button" className="rm" onClick={onRemove} aria-label="Remove photo"><Icon name="close" /></button>}
    </div>
  )
}

/**
 * Full-screen photo viewer — the photo opens right here inside the app.
 * Tap the photo to zoom in / out, swipe or use ‹ › to move between photos.
 */
export function BillViewer({ list, start = 0, onClose }: { list: Attachment[]; start?: number; onClose(): void }) {
  const [i, setI] = useState(Math.min(start, list.length - 1))
  const [src, setSrc] = useState('')
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [zoom, setZoom] = useState(false)
  const touchX = useRef<number | null>(null)
  const att = list[i]

  useEffect(() => {
    let on = true
    setSrc(''); setState('loading'); setZoom(false)
    if (att) billUrl(att.path).then(u => { if (!on) return; if (u) setSrc(u); else setState('error') })
    // warm up the neighbours so "Next" is instant
    for (const n of [list[i + 1], list[i - 1]]) if (n) billUrl(n.path).then(u => { if (u) new Image().src = u })
    return () => { on = false }
  }, [att, i, list])

  const prev = () => setI(x => Math.max(0, x - 1))
  const next = () => setI(x => Math.min(list.length - 1, x + 1))

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, onClose])

  async function download() {
    try {
      const blob = await (await fetch(src)).blob()
      await saveBlob(blob, `bill-${i + 1}.jpg`)
    } catch { /* ignore */ }
  }

  if (!att) return null
  return (
    <div className="viewer" role="dialog" aria-modal="true">
      <div className="vbar">
        <span>Bill photo {i + 1} of {list.length}</span>
        {state === 'ok' && <button className="vbtn" onClick={download} aria-label="Download photo"><Icon name="download" /></button>}
        <button className="vbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>

      <div className={`vimg ${zoom ? 'zoom' : ''}`}
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (zoom || touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          if (dx < -50) next(); else if (dx > 50) prev()
          touchX.current = null
        }}>
        {state === 'loading' && <div className="spinner" style={{ margin: 0 }} />}
        {state === 'error' && (
          <div className="vmsg">
            <Icon name="image" />
            <b>Photo not available yet</b>
            <span>It is still waiting to upload from the phone where it was added. Open the app on that phone with internet, then try again.</span>
          </div>
        )}
        {src && state !== 'error' && (
          <img src={src} alt={`Bill ${i + 1}`} style={{ display: state === 'ok' ? 'block' : 'none' }}
            onLoad={() => setState('ok')} onError={() => setState('error')}
            onClick={() => setZoom(z => !z)} />
        )}
      </div>

      <div className="vnav">
        <button disabled={i === 0} onClick={prev} aria-label="Previous photo">‹</button>
        <small>{state === 'ok' ? (zoom ? 'Tap photo to fit screen' : 'Tap photo to zoom') : ''}</small>
        <button disabled={i === list.length - 1} onClick={next} aria-label="Next photo">›</button>
      </div>
    </div>
  )
}
