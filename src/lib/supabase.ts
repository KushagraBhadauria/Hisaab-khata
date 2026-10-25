import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** When Supabase keys are missing the app runs in Demo mode: data stays only on this device. */
export const DEMO = !url || !key

export const supabase: SupabaseClient | null = DEMO
  ? null
  : createClient(url!, key!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })

export const GOOGLE_LOGIN = import.meta.env.VITE_ENABLE_GOOGLE === 'true'
