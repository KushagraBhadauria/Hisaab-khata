import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEMO, supabase } from './supabase'
import { pref } from './idb'

export interface AppUser { id: string; email: string; name: string }

interface AuthCtx {
  user: AppUser | null
  loading: boolean
  /** true right after the user opened a password-reset link */
  recovering: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, name: string): Promise<'signed-in' | 'confirm-email'>
  signInWithGoogle(): Promise<void>
  sendReset(email: string): Promise<void>
  setPassword(password: string): Promise<void>
  updateName(name: string): Promise<void>
  signOut(): Promise<void>
  startDemo(name: string): void
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)
export const useAuth = () => useContext(Ctx)

const DEMO_KEY = 'hk:demo-user'

function friendly(msg: string) {
  if (/invalid login/i.test(msg)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first — check your inbox.'
  if (/already registered/i.test(msg)) return 'This email already has an account. Please sign in.'
  if (/password should be/i.test(msg)) return 'Password must be at least 6 characters.'
  if (/fetch|network/i.test(msg)) return 'No internet connection. Please try again.'
  return msg
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (DEMO || !supabase) {
      try { const s = pref.get(DEMO_KEY, ''); if (s) setUser(JSON.parse(s)) } catch { /* ignore */ }
      setLoading(false)
      return
    }
    const map = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): AppUser | null =>
      u ? { id: u.id, email: u.email ?? '', name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || (u.email ?? '').split('@')[0] } : null
    supabase.auth.getSession().then(({ data }) => { setUser(map(data.session?.user)); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setUser(map(session?.user))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const api: AuthCtx = {
    user, loading, recovering,
    async signIn(email, password) {
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(friendly(error.message))
    },
    async signUp(email, password, name) {
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(), password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) throw new Error(friendly(error.message))
      if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error(friendly('already registered'))
      return data.session ? 'signed-in' : 'confirm-email'
    },
    async signInWithGoogle() {
      const { error } = await supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
      if (error) throw new Error(friendly(error.message))
    },
    async sendReset(email) {
      const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` })
      if (error) throw new Error(friendly(error.message))
    },
    async setPassword(password) {
      const { error } = await supabase!.auth.updateUser({ password })
      if (error) throw new Error(friendly(error.message))
      setRecovering(false)
    },
    async updateName(name) {
      if (DEMO) {
        const u = { ...user!, name }; setUser(u); pref.set(DEMO_KEY, JSON.stringify(u)); return
      }
      const { error } = await supabase!.auth.updateUser({ data: { full_name: name } })
      if (error) throw new Error(friendly(error.message))
      setUser(u => (u ? { ...u, name } : u))
    },
    async signOut() {
      if (DEMO) { pref.set(DEMO_KEY, ''); setUser(null); return }
      await supabase!.auth.signOut()
      setUser(null)
    },
    startDemo(name) {
      const u = { id: 'demo', email: 'demo@device.local', name: name || 'Demo User' }
      pref.set(DEMO_KEY, JSON.stringify(u)); setUser(u)
    },
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
