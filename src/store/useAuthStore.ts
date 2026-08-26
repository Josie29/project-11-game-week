import { create } from 'zustand'
import { isSupabaseConfigured, supabase } from './supabase'

/** Who is signed in, as much of it as the HUD needs to draw. */
export interface Player {
  readonly id: string
  /** Display name from Google, or the email if Google did not send one. */
  readonly name: string
  /** Google avatar URL, or null. */
  readonly avatarUrl: string | null
}

/** Where the session is, so the HUD can say so rather than guessing. */
export enum AuthStatus {
  /** Still asking Supabase whether a session was restored. */
  Restoring = 'restoring',
  /** Playing without an account. The default, and always allowed. */
  Guest = 'guest',
  SignedIn = 'signedIn',
}

interface AuthStore {
  status: AuthStatus
  player: Player | null
  /** Set when a sign-in attempt failed, so the HUD can say why. */
  error: string | null

  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

/** Pulls the display fields out of a Supabase user's Google metadata. */
function toPlayer(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Player {
  const metadata = user.user_metadata ?? {}
  const name = metadata.full_name ?? metadata.name ?? user.email ?? 'Player'
  const avatar = metadata.avatar_url ?? metadata.picture

  return {
    id: user.id,
    name: typeof name === 'string' ? name : 'Player',
    avatarUrl: typeof avatar === 'string' ? avatar : null,
  }
}

/**
 * The signed-in session, and nothing else.
 *
 * Deliberately holds no save data. Supabase owns the session and its refresh,
 * `saveSync` owns the save, and this only answers "who is playing" — which is
 * the one question the HUD asks and the sync layer keys off.
 *
 * Not persisted: the Supabase client already persists its own session, and a
 * second copy in `localStorage` would be a second thing to get out of date.
 */
export const useAuthStore = create<AuthStore>()((set) => ({
  // With no Supabase configured there is nothing to restore, so the game starts
  // as a guest immediately rather than waiting on a check that will never come.
  status: isSupabaseConfigured ? AuthStatus.Restoring : AuthStatus.Guest,
  player: null,
  error: null,

  signInWithGoogle: async () => {
    if (!supabase) return
    set({ error: null })

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Back to wherever the player was, minus any query string — a `?boot=`
      // link surviving the round trip would re-run the shortcut on return.
      options: { redirectTo: window.location.origin },
    })

    if (error) set({ error: error.message })
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    // The local save is deliberately left alone. Signing out drops the account,
    // not the chips — the player carries on as a guest with what they had.
    set({ status: AuthStatus.Guest, player: null, error: null })
  },
}))

/**
 * Starts listening for session changes.
 *
 * Called once at startup. Returns the state to `Guest` rather than leaving it
 * on `Restoring` when there is no session, so the HUD never shows a spinner
 * forever for a player who simply has no account.
 *
 * @param onSignIn Called with the player each time a session becomes active,
 *   including the one restored on page load. This is `saveSync`'s hook.
 */
export function watchSession(onSignIn: (player: Player) => void): void {
  if (!supabase) return

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      useAuthStore.setState({ status: AuthStatus.Guest, player: null })
      return
    }

    const player = toPlayer(session.user)
    useAuthStore.setState({ status: AuthStatus.SignedIn, player })
    onSignIn(player)
  })
}
