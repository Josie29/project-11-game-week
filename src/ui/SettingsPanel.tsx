import { useEffect, useState } from 'react'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { useSessionStore } from '../store/useSessionStore'
import { AccountBadge } from './AccountBadge'
import { ModeChoice } from './ModeChoice'

/**
 * The one menu in the game: who you are, whether anyone else is here, and the
 * way out of everything.
 *
 * It exists mostly for the mode toggle. Signing in and changing your appearance
 * were both already reachable — the badge under the bankroll and the shop's
 * fitting mirror — but the play mode was chosen once on the welcome screen and
 * then locked for the lifetime of the save.
 *
 * Escape closes it, which is not a second meaning for that key: everywhere else
 * in the game Escape leaves the thing you are in, and so does this.
 */
export function SettingsPanel() {
  const mode = useSessionStore((state) => state.mode)
  const setMode = useSessionStore((state) => state.setMode)
  const closeSettings = useSessionStore((state) => state.closeSettings)
  const resetSession = useSessionStore((state) => state.reset)

  const resetAppearance = useAppearanceStore((state) => state.reset)
  const resetBankroll = useGameStore((state) => state.resetBankroll)
  const leaveVenue = useGameStore((state) => state.leaveVenue)

  /*
   * Armed, then confirmed. This is the only control in the game that destroys
   * anything, and it is two clicks from a menu that is one key away.
   */
  const [confirmingReset, setConfirmingReset] = useState(false)

  /*
   * The mode the player has picked but not yet saved.
   *
   * Seeded from the live value and thrown away with the component, so closing
   * the panel on an unsaved choice discards it — which is what "Save changes"
   * promises by existing. Nothing reaches the store, and therefore nothing
   * reaches the socket, until it is pressed.
   */
  const [pendingMode, setPendingMode] = useState(mode)
  const modeChanged = pendingMode !== mode

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSettings()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSettings])

  function startOver() {
    /*
     * Out of any room first.
     *
     * `App` picks what the Canvas draws from `location`, and the welcome screen
     * only replaces the DOM on top of it — so a reset pressed inside the shop
     * would put the title card over the shop's interior.
     */
    leaveVenue()
    resetBankroll()
    resetAppearance()
    // Last, because it is the one that closes this panel and puts the welcome
    // screen back up.
    resetSession()
  }

  return (
    <div className="settings">
      <div className="settings__panel">
        <header className="settings__header">
          <h2 className="settings__title">Settings</h2>
          <button
            type="button"
            className="button button--ghost settings__close"
            onClick={closeSettings}
          >
            Close <kbd>Esc</kbd>
          </button>
        </header>

        <section className="welcome__section">
          <h3 className="welcome__legend">Playing as</h3>
          <AccountBadge />
        </section>

        <section className="welcome__section">
          <h3 className="welcome__legend">How to play</h3>

          {/*
            Chosen, then saved — the same two steps the welcome screen has,
            where picking a mode does nothing until "Enter the strip" is pressed.
            Applying on click would have made one control behave two ways in the
            two places it appears.

            It also earns the pause on its own. Switching to Multiplayer starts
            broadcasting this player's name and character to a room full of
            strangers, and the welcome screen promises a guest that nothing is
            sent anywhere — so the moment that stops being true is worth a
            deliberate press rather than a stray click.
          */}
          <ModeChoice value={pendingMode} onPick={setPendingMode} />

          {modeChanged && (
            <div className="settings__pending">
              <p className="welcome__note settings__unsaved">Not applied yet.</p>
              <div className="welcome__choices">
                <button type="button" className="button" onClick={() => setPendingMode(mode)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => setMode(pendingMode)}
                >
                  Save changes
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="welcome__section">
          <h3 className="welcome__legend">Start over</h3>

          {confirmingReset ? (
            <>
              <p className="welcome__note">
                This clears your bankroll, any marker you owe, your wardrobe and
                your character. If you are signed in it clears them on your
                account too, on every device.
              </p>
              <div className="welcome__choices">
                <button type="button" className="button" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </button>
                <button type="button" className="button settings__destructive" onClick={startOver}>
                  Wipe everything
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="welcome__note">
                Back to the welcome screen with a fresh $500 and nothing in the
                wardrobe.
              </p>
              <button
                type="button"
                className="button settings__reset"
                onClick={() => setConfirmingReset(true)}
              >
                Start over
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
