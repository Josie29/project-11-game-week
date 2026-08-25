import { AuthStatus, useAuthStore } from '../store/useAuthStore'
import { isSupabaseConfigured } from '../store/supabase'

/**
 * The sign-in control, tucked under the bankroll.
 *
 * Deliberately small and deliberately optional. The brief is a game demoable in
 * under five minutes, so there is no sign-in wall: play starts immediately as a
 * guest and an account only ever adds something — the same chips on a second
 * device. A modal in front of the strip would cost more than the feature is
 * worth.
 *
 * Renders nothing at all when Supabase is unconfigured, so a build without the
 * environment variables looks exactly like the game did before accounts.
 */
export function AccountBadge() {
  const status = useAuthStore((state) => state.status)
  const player = useAuthStore((state) => state.player)
  const error = useAuthStore((state) => state.error)
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)
  const signOut = useAuthStore((state) => state.signOut)

  if (!isSupabaseConfigured) return null

  // Restoring is usually a single frame. Holding the row's height while it
  // resolves stops the bankroll jumping as the badge appears underneath it.
  if (status === AuthStatus.Restoring) {
    return <span className="hud__account hud__account--quiet">&nbsp;</span>
  }

  if (status === AuthStatus.SignedIn && player) {
    return (
      <span className="hud__account">
        {player.avatarUrl !== null && (
          <img className="hud__avatar" src={player.avatarUrl} alt="" width={20} height={20} />
        )}
        <span className="hud__account-name">{player.name}</span>
        <button type="button" className="hud__account-action" onClick={() => void signOut()}>
          Sign out
        </button>
      </span>
    )
  }

  return (
    <span className="hud__account">
      <button
        type="button"
        className="hud__account-action"
        onClick={() => void signInWithGoogle()}
      >
        Sign in with Google to save
      </button>
      {error !== null && <span className="hud__account-error">{error}</span>}
    </span>
  )
}
