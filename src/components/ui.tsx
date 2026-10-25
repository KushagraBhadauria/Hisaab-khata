import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { DEMO } from '../lib/supabase'
import { relTime } from '../lib/format'
import { useStore } from '../lib/store'

// ---------------- Bottom sheet ----------------
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <h2>
          <span>{title}</span>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </h2>
        {children}
      </div>
    </>
  )
}

// ---------------- Toast with optional Undo ----------------
interface ToastMsg { text: string; action?: { label: string; run(): void } }
const ToastCtx = createContext<(t: ToastMsg) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((t: ToastMsg) => {
    setMsg(t)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), t.action ? 5000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          <span>{msg.text}</span>
          {msg.action && <button onClick={() => { msg.action!.run(); setMsg(null) }}>{msg.action.label}</button>}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// ---------------- Sync badge ----------------
export function SyncBadge() {
  const { sync, outbox, lastSync, refresh } = useStore()
  const label = DEMO ? 'On this device'
    : sync === 'syncing' ? 'Syncing…'
    : sync === 'offline' ? `Offline${outbox.length ? ` · ${outbox.length} pending` : ''}`
    : sync === 'error' ? 'Sync issue · retry'
    : lastSync ? `Synced ${relTime(lastSync)}` : 'Synced'
  return (
    <button className={`sync ${sync}`} onClick={() => refresh()} title="Tap to sync now">
      <i />{label}
    </button>
  )
}
