import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** When Supabase keys are missing the app runs in Demo mode: data stays only on this device. */
export const DEMO = !url || !key

/** What the email link told us when the app was opened (read before Supabase cleans the URL). */
export const LANDING = (() => {
  const q = new URLSearchParams(window.location.search)
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const get = (k: string) => q.get(k) ?? h.get(k)
  return { fromEmail: !!(get('code') || get('token_hash') || get('type') || get('error_description')), error: get('error_description') }
})()

export const supabase: SupabaseClient | null = DEMO
  ? null
  : createClient(url!, key!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

/**
 * Where links in emails (confirm sign-up, reset password) should open.
 * Set VITE_SITE_URL to your live address (e.g. https://hisaab-khata-portal.vercel.app)
 * so emails never point to "localhost" — needed for the Android app too.
 */
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin).replace(/\/+$/, '')

export const GOOGLE_LOGIN = import.meta.env.VITE_ENABLE_GOOGLE === 'true'
