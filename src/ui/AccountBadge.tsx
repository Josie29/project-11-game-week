import { AuthStatus, useAuthStore } from '../store/useAuthStore'
import { isSupabaseConfigured } from '../store/supabase'

/**
 * Who is playing, and the control to change it. Lives in the settings panel.
 *
 * Deliberately optional. The brief is a game demoable in under five minutes, so
 * there is no sign-in wall: play starts immediately as a guest and an account
 * only ever adds something — the same chips on a second device.
 *
 * It used to render nothing at all when Supabase was unconfigured, which was
 * right under the bankroll and wrong the moment it moved: in the panel it sits
 * beneath a "Playing as" heading, and a heading with nothing under it reads as
 * a screen that failed to load. Unconfigured now says "Guest", which is both
 * true and the answer to the question the heading asks. The sign-in *button*
 * still only appears when there is something to sign in to.
 */
export function AccountBadge() {
  const status = useAuthStore((state) => state.status)
  const player = useAuthStore((state) => state.player)
  const error = useAuthStore((state) => state.error)
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)
  const signOut = useAuthStore((state) => state.signOut)

  if (!isSupabaseConfigured) {
    return (
      <p className="welcome__account">
        <span>Guest</span>
        <span className="welcome__note">
          Everything stays in this browser. Nothing is sent anywhere.
        </span>
      </p>
    )
  }

  // Restoring is usually a single frame. Holding the row's height while it
  // resolves stops the panel reflowing as the badge resolves underneath it.
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
