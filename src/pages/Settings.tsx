import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SyncBadge, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { avatarBg, initials, relTime, todayISO } from '../lib/format'
import { useStore } from '../lib/store'
import { DEMO } from '../lib/supabase'
import { saveBlob } from '../export/save'

export default function Settings() {
  const nav = useNavigate()
  const auth = useAuth()
  const store = useStore()
  const toast = useToast()
  const [name, setName] = useState(auth.user?.name ?? '')
  const [busy, setBusy] = useState(false)

  async function saveName() {
    if (!name.trim() || name.trim() === auth.user?.name) return
    try { await auth.updateName(name.trim()); toast({ text: 'Name updated' }) } catch (e) { toast({ text: (e as Error).message }) }
  }

  async function exportAll() {
    if (!store.books.length) return toast({ text: 'No khatas to export yet' })
    setBusy(true)
    try {
      const { buildAllExcel } = await import('../export/excel')
      const blob = await buildAllExcel(store.books, store.entries, store.style)
      await saveBlob(blob, `All-Khatas_${todayISO()}.xlsx`)
      toast({ text: 'Backup downloaded' })
    } catch (e) { toast({ text: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="shell">
      <div className="top">
        <button className="iconbtn" onClick={() => nav('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="grow"><h1>Settings</h1></div>
        <SyncBadge />
      </div>

      <div className="group">
        <h3>Profile</h3>
        <div className="item">
          <div className="av sm" style={{ background: avatarBg(auth.user?.name ?? '') }}>{initials(auth.user?.name ?? '')}</div>
          <div className="grow">
            <input value={name} onChange={e => setName(e.target.value)} onBlur={saveName}
              style={{ border: 0, background: 'none', fontWeight: 700, fontSize: 15, width: '100%' }} aria-label="Your name" />
            <small>{DEMO ? 'Demo mode · data on this device only' : auth.user?.email}</small>
          </div>
          <Icon name="edit" />
        </div>
      </div>

      <div className="group">
        <h3>Balance display</h3>
        <div style={{ padding: '8px 15px 14px' }}>
          <div className="toggle" style={{ marginBottom: 6 }}>
            <button className={store.style === 'sign' ? 'on' : ''} onClick={() => store.setStyle('sign')}>−97,355 (minus sign)</button>
            <button className={store.style === 'drcr' ? 'on' : ''} onClick={() => store.setStyle('drcr')}>₹97,355 Dr / Cr</button>
          </div>
          <small className="muted" style={{ fontSize: 12 }}>Debit (−) reduces the balance, Credit (+) increases it. A negative balance is shown as Dr.</small>
        </div>
      </div>

      <div className="group">
        <h3>Data</h3>
        <button className="item" onClick={exportAll} disabled={busy}>
          <Icon name="excel" />
          <div className="grow">{busy ? 'Preparing…' : 'Download all khatas (Excel)'}<small>Summary + one sheet per khata — a full backup</small></div>
        </button>
        {!DEMO && (
          <button className="item" onClick={() => store.refresh()}>
            <Icon name="refresh" />
            <div className="grow">Sync now<small>{store.lastSync ? `Last synced ${relTime(store.lastSync)}` : 'Not synced yet'}{store.outbox.length ? ` · ${store.outbox.length} change(s) waiting` : ''}</small></div>
          </button>
        )}
        {store.syncError && <div className="err" style={{ margin: '0 15px 12px' }}>{store.syncError}</div>}
      </div>

      <div className="group">
        <h3>Account</h3>
        <button className="item" onClick={() => auth.signOut().then(() => nav('/'))}>
          <Icon name="logout" />
          <div className="grow" style={{ color: 'var(--dr)' }}>Sign out</div>
        </button>
      </div>

      <p className="note">Hisaab Khata · v1.0<br />{store.books.length} khatas · {store.entries.length} entries</p>
    </div>
  )
}
