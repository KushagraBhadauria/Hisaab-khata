import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { DEMO, GOOGLE_LOGIN, LANDING } from '../lib/supabase'
import { Icon } from '../components/Icon'

type Mode = 'signin' | 'signup' | 'forgot'

export function Brand({ sub }: { sub: string }) {
  return (
    <div className="brand">
      <div className="logo"><Icon name="book" /></div>
      <h1>Hisaab Khata</h1>
      <p>{sub}</p>
    </div>
  )
}

export default function AuthPage() {
  const auth = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Opened from the confirmation email in a browser that can't finish the login itself
  // (e.g. a different browser, or the iPhone home-screen app): the email IS confirmed — just sign in.
  const [ok, setOk] = useState(() =>
    LANDING.fromEmail && !(LANDING.error && /expired|invalid/i.test(LANDING.error))
      ? '✅ Your email is confirmed. Please sign in below.' : '')

  if (DEMO) {
    return (
      <div className="auth">
        <Brand sub="Simple debit / credit ledger for every khata" />
        <div className="card">
          <div className="ok" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            Demo mode — Supabase is not connected yet, so data is saved only on this device.
          </div>
          <label className="field"><span>Your name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kushagra" /></label>
          <button className="btn b-pri w100" onClick={() => auth.startDemo(name.trim())}>Start using the app</button>
        </div>
        <p className="note">Add your Supabase URL and key in the <b>.env</b> file to turn on login and cloud sync.</p>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setOk(''); setBusy(true)
    try {
      if (mode === 'signin') await auth.signIn(email, password)
      else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Please enter your name.')
        const r = await auth.signUp(email, password, name)
        if (r === 'confirm-email') { setOk('Account created! We sent a confirmation link to your email — open it, then sign in.'); setMode('signin') }
      } else {
        await auth.sendReset(email)
        setOk('Password reset link sent. Check your email.')
      }
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }

  const go = (m: Mode) => { setMode(m); setErr(''); setOk('') }

  return (
    <div className="auth">
      <Brand sub={mode === 'signup' ? 'Create your free account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back — sign in to your khatas'} />
      <form className="card" onSubmit={submit}>
        {mode !== 'forgot' && (
          <div className="toggle">
            <button type="button" className={mode === 'signin' ? 'on' : ''} onClick={() => go('signin')}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'on' : ''} onClick={() => go('signup')}>Create account</button>
          </div>
        )}
        {err && <div className="err">{err}</div>}
        {ok && <div className="ok">{ok}</div>}
        {mode === 'signup' && (
          <label className="field"><span>Full name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></label>
        )}
        <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
        {mode !== 'forgot' && (
          <label className="field"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required /></label>
        )}
        <button className="btn b-pri w100" disabled={busy} style={{ marginTop: 4 }}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          {mode === 'signin' && <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>}
          {mode === 'forgot' && <button type="button" className="link" onClick={() => go('signin')}>← Back to sign in</button>}
        </div>
        {GOOGLE_LOGIN && mode !== 'forgot' && (
          <>
            <div className="divider">or</div>
            <button type="button" className="btn b-ghost w100" onClick={() => auth.signInWithGoogle().catch(x => setErr(x.message))}>
              <Icon name="google" /> Continue with Google
            </button>
          </>
        )}
      </form>
      <p className="note">Your khatas are private — only you can see the records you create.</p>
    </div>
  )
}

export function ResetPassword() {
  const auth = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw !== pw2) return setErr('Both passwords must match.')
    setBusy(true)
    try { await auth.setPassword(pw) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="auth">
      <Brand sub="Choose a new password" />
      <form className="card" onSubmit={submit}>
        {err && <div className="err">{err}</div>}
        <label className="field"><span>New password</span><input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={6} required /></label>
        <label className="field"><span>Confirm password</span><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={6} required /></label>
        <button className="btn b-pri w100" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  )
}
