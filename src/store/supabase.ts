import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/*
 * The Supabase client, or nothing at all.
 *
 * Deliberately tolerant of missing configuration. The game is playable without
 * an account by design, so a build with no environment variables — a fresh
 * clone, a preview deploy before the vars are set, a capture run — has to run
 * exactly as it did before accounts existed rather than crash on boot. Every
 * caller checks `isSupabaseConfigured` first, and the sign-in control hides
 * itself when it is false.
 *
 * The publishable key ships in the bundle on purpose. It is not a secret: it
 * identifies the project and nothing more, and the authorization is the row
 * level security policy on `saves`, which the browser cannot talk its way past.
 */

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** True when both environment variables are present and non-empty. */
export const isSupabaseConfigured =
  typeof url === 'string' && url.length > 0 && typeof publishableKey === 'string' && publishableKey.length > 0

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        // The OAuth return lands back on the app's own URL carrying a code;
        // this is what exchanges it for a session without a server route.
        detectSessionInUrl: true,
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
