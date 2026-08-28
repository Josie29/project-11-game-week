import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { useSessionStore } from '../store/useSessionStore'
import { EMOTE_LABELS, type EmoteId, emoteSetFor, SAY_MAX_CHARS } from '../world/emotes'

/**
 * The things a player can say: a numbered list, and a line to type.
 *
 * The list follows the table (`emoteSetFor`) — craps talk at the rail, table
 * talk at blackjack, waves and invitations everywhere else. Buttons rather
 * than a legend of keys because on a phone the buttons *are* the input — the
 * digit badges are hidden there by the same stylesheet rule that hides every
 * other `<kbd>`.
 *
 * The digits are owned here, while mounted — which is exactly while the
 * picker is open. The table panels' own digit hotkeys yield for the same
 * window (they check `emotePickerOpen`), so a "2" aimed at "Table win!" can
 * never land as a $25 stake. Escape closes, on the rule that closing a thing
 * is leaving it; `T` also closes, but that listener lives in the HUD, which
 * is the only thing mounted to hear it when the picker is *not* up.
 *
 * The typed line is deliberately not auto-focused: focus would swallow the
 * digits and turn every WASD press into prose. Clicking into it hands the
 * keyboard over instead — and the input stops its own keys propagating, so
 * a typed "w" cannot simultaneously walk the player up the street.
 */
export function EmotePicker() {
  const activeTable = useGameStore((state) => state.activeTable)
  const sendEmote = usePresenceStore((state) => state.sendEmote)
  const sendSay = usePresenceStore((state) => state.sendSay)
  const closeEmotePicker = useSessionStore((state) => state.closeEmotePicker)

  const [draft, setDraft] = useState('')
  const emotes = emoteSetFor(activeTable)

  function say(emote: EmoteId): void {
    sendEmote(emote)
    closeEmotePicker()
  }

  function sayTyped(): void {
    sendSay(draft)
    setDraft('')
    closeEmotePicker()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      // Keystrokes aimed at the typed line are its own — the input handles
      // them itself and stops propagation, but a focused input on some
      // platforms still lets the event reach the window first.
      if (event.target instanceof HTMLInputElement) return
      if (event.key === 'Escape') {
        closeEmotePicker()
        return
      }
      // Digits map onto the open list. Parsed rather than compared per key;
      // anything outside the list falls through.
      const digit = Number(event.key)
      const emote = Number.isInteger(digit) ? emotes[digit - 1] : undefined
      if (emote) {
        sendEmote(emote)
        closeEmotePicker()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [emotes, sendEmote, closeEmotePicker])

  return (
    <div className="emote-picker">
      {emotes.map((emote, index) => (
        <button
          key={emote}
          type="button"
          className="button emote-picker__option"
          onClick={() => say(emote)}
        >
          <kbd>{index + 1}</kbd> {EMOTE_LABELS[emote]}
        </button>
      ))}
      <div className="emote-picker__say">
        <input
          type="text"
          className="emote-picker__input"
          placeholder="or type it…"
          aria-label="Say something"
          maxLength={SAY_MAX_CHARS}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            /*
             * The keyboard belongs to the sentence while this has focus.
             *
             * Every other listener in the game hangs off `window` — WASD's
             * sampled state, F's interact, T's toggle, the digits above — and
             * React delivers this event from the root container before it
             * bubbles on to them. Stopping it here is what makes typing
             * "watch this" not walk the player, take a seat and close the
             * picker mid-word.
             */
            event.stopPropagation()
            if (event.key === 'Enter') sayTyped()
            if (event.key === 'Escape') closeEmotePicker()
          }}
        />
        <button
          type="button"
          className="button emote-picker__option"
          onClick={sayTyped}
          disabled={draft.trim().length === 0}
        >
          Say
        </button>
      </div>
    </div>
  )
}
