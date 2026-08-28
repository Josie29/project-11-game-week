import { useEffect } from 'react'
import { TABLE_LABELS } from '../scenes/casinoFloorLayout'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { EMOTE_LABELS, type EmoteId, INVITE_RESPONSES, INVITE_WINDOW_MS } from '../world/emotes'

/**
 * Somebody asked this player to come play, and this is where they answer.
 *
 * The answers are ordinary emotes — the asker sees them as a bubble over the
 * responder's head, exactly like anything else said — so the card is nothing
 * but a shortcut to two presets with the asker's name over it.
 *
 * It expires on its own after `INVITE_WINDOW_MS`: an invitation is a moment,
 * and a card that waits forever nags. The timeout clears the store's invite,
 * so the table hotkey yield below ends with the card rather than lingering.
 *
 * Digits answer it only away from the tables. Seated, the digits belong to
 * stakes and chips and this card keeps its hands off them — the buttons still
 * work, and on a phone they are all there is anyway.
 */
export function InvitePrompt() {
  const invite = usePresenceStore((state) => state.invite)
  const peers = usePresenceStore((state) => state.peers)
  const sendEmote = usePresenceStore((state) => state.sendEmote)
  const clearInvite = usePresenceStore((state) => state.clearInvite)
  const activeTable = useGameStore((state) => state.activeTable)

  const asker = invite ? (peers[invite.from]?.name ?? 'A player') : null
  const seated = activeTable !== null

  function respond(emote: EmoteId): void {
    sendEmote(emote)
    clearInvite()
  }

  /*
   * The expiry, scheduled from the invite's own stamp so a replacement invite
   * restarts it — the effect re-runs per `at`, and its cleanup cancels the
   * timer the old invite was living on.
   */
  useEffect(() => {
    if (!invite) return

    const remaining = INVITE_WINDOW_MS - (performance.now() - invite.at)
    if (remaining <= 0) {
      clearInvite()
      return
    }
    const timer = setTimeout(clearInvite, remaining)
    return () => clearTimeout(timer)
  }, [invite, clearInvite])

  useEffect(() => {
    if (!invite || seated) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'Escape') {
        clearInvite()
        return
      }
      const digit = Number(event.key)
      const response = Number.isInteger(digit) ? INVITE_RESPONSES[digit - 1] : undefined
      if (response) {
        sendEmote(response)
        clearInvite()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [invite, seated, sendEmote, clearInvite])

  if (!invite) return null

  return (
    <div className="invite-prompt">
      <span className="invite-prompt__ask">
        <strong>{asker}</strong>: {TABLE_LABELS[invite.table]}?
      </span>
      {INVITE_RESPONSES.map((response, index) => (
        <button
          key={response}
          type="button"
          className="button emote-picker__option"
          onClick={() => respond(response)}
        >
          {!seated && <kbd>{index + 1}</kbd>} {EMOTE_LABELS[response]}
        </button>
      ))}
    </div>
  )
}
