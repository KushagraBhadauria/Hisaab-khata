import { useEffect, useState } from 'react'
import { pref } from '../lib/idb'
import { Icon } from './Icon'
import { Sheet } from './ui'

/**
 * "Install app" helper.
 *  - Android / desktop Chrome: shows an Install button (uses the browser's install prompt).
 *  - iPhone / iPad: Apple has no install prompt, so we show the 3 steps (Share → Add to Home Screen).
 *  - Hidden when the app is already installed or the user dismissed it.
 */
interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const ua = navigator.userAgent
export const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isIOSChrome = isIOS && /CriOS/i.test(ua)
const isIOSOtherBrowser = isIOS && /FxiOS|EdgiOS|OPiOS/i.test(ua)
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

let deferred: BIPEvent | null = null
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIPEvent; window.dispatchEvent(new Event('hk:installable')) })

export function useInstall() {
  const [canPrompt, setCanPrompt] = useState(!!deferred)
  useEffect(() => {
    const on = () => setCanPrompt(true)
    window.addEventListener('hk:installable', on)
    return () => window.removeEventListener('hk:installable', on)
  }, [])
  const installed = isStandalone()
  return {
    installed,
    available: !installed && (canPrompt || isIOS),
    async install(): Promise<'prompted' | 'ios-help'> {
      if (deferred) { await deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; setCanPrompt(false); return 'prompted' }
      return 'ios-help'
    },
  }
}

export function IOSInstallHelp({ onClose }: { onClose(): void }) {
  return (
    <Sheet title="Install on iPhone" onClose={onClose}>
      {isIOSOtherBrowser && <div className="err">Please open this page in <b>Safari</b> or <b>Chrome</b> to install it.</div>}
      <ol className="ios-steps">
        <li><b>1</b><span>Tap the <b>Share</b> button {isIOSChrome ? <>at the <b>top right</b> of the address bar</> : <>at the <b>bottom</b> of Safari</>}
          <i className="ios-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg></i></span></li>
        <li><b>2</b><span>Scroll down and tap <b>Add to Home Screen</b> <i className="ios-ico">＋</i></span></li>
        <li><b>3</b><span>Tap <b>Add</b> (top right). Open <b>Hisaab</b> from your home screen.</span></li>
      </ol>
      <div className="note" style={{ textAlign: 'left' }}>
        After installing, sign in once inside the home-screen app — iPhone keeps it separate from Safari.
      </div>
      <button className="btn b-pri w100" style={{ marginTop: 14 }} onClick={onClose}>Got it</button>
    </Sheet>
  )
}

export default function InstallBanner() {
  const { available, install } = useInstall()
  const [hidden, setHidden] = useState(() => pref.get('hk:install-dismissed', '') === '1')
  const [help, setHelp] = useState(false)
  if (!available || hidden) return null
  return (
    <>
      <div className="install">
        <div className="ill"><Icon name="download" /></div>
        <div className="grow"><b>Install Hisaab Khata</b><small>Open it like an app from your home screen</small></div>
        <button className="btn b-pri" onClick={async () => { if ((await install()) === 'ios-help') setHelp(true) }}>Install</button>
        <button className="x" aria-label="Dismiss" onClick={() => { pref.set('hk:install-dismissed', '1'); setHidden(true) }}><Icon name="close" /></button>
      </div>
      {help && <IOSInstallHelp onClose={() => setHelp(false)} />}
    </>
  )
}
