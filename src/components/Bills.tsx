import { useEffect, useState } from 'react'
import { billUrl, publicUrl } from '../lib/bills'
import type { Attachment } from '../lib/types'
import { Icon } from './Icon'

/** Small square preview of one bill photo. */
export function BillThumb({ att, onOpen, onRemove }: { att: Attachment; onOpen(): void; onRemove?(): void }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let on = true; billUrl(att.path).then(u => on && setSrc(u)); return () => { on = false } }, [att.path])
  return (
    <div className="thumb">
      <button type="button" className="img" onClick={onOpen} aria-label="View bill photo">
        {src ? <img src={src} alt="Bill" loading="lazy" /> : <Icon name="image" />}
      </button>
      {onRemove && <button type="button" className="rm" onClick={onRemove} aria-label="Remove photo"><Icon name="close" /></button>}
    </div>
  )
}

/** Full-screen photo viewer with next / previous. */
export function BillViewer({ list, start = 0, onClose }: { list: Attachment[]; start?: number; onClose(): void }) {
  const [i, setI] = useState(start)
  const [src, setSrc] = useState('')
  const att = list[i]
  useEffect(() => { let on = true; setSrc(''); if (att) billUrl(att.path).then(u => on && setSrc(u)); return () => { on = false } }, [att])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI(x => Math.min(list.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [list.length, onClose])
  if (!att) return null
  const link = publicUrl(att.path) || src
  return (
    <div className="viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="vbar" onClick={e => e.stopPropagation()}>
        <span>Bill {i + 1} of {list.length}</span>
        {link && <a className="vbtn" href={link} target="_blank" rel="noreferrer">Open full size</a>}
        <button className="vbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="vimg" onClick={e => e.stopPropagation()}>
        {src ? <img src={src} alt={`Bill ${i + 1}`} /> : <div className="spinner" style={{ margin: 0 }} />}
      </div>
      {list.length > 1 && (
        <div className="vnav" onClick={e => e.stopPropagation()}>
          <button disabled={i === 0} onClick={() => setI(i - 1)}>‹ Prev</button>
          <button disabled={i === list.length - 1} onClick={() => setI(i + 1)}>Next ›</button>
        </div>
      )}
    </div>
  )
}
