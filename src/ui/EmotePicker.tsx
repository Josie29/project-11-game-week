import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { useSessionStore } from '../store/useSessionStore'
import { EMOTE_LABELS, type EmoteId, emoteSetFor } from '../world/emotes'

/**
 * The list of things a player can say, numbered.
 *
 * Four entries, always: the set follows the table (`emoteSetFor`), so it is
 * craps talk at the rail, table talk at blackjack, and a wave everywhere
 * else. Buttons rather than a legend of keys because on a phone the buttons
 * *are* the input — the digit badges are hidden there by the same stylesheet
 * rule that hides every other `<kbd>`.
 *
 * The digits are owned here, while mounted — which is exactly while the
 * picker is open. The table panels' own digit hotkeys yield for the same
 * window (they check `emotePickerOpen`), so a "2" aimed at "Table win!" can
 * never land as a $25 stake. Escape closes, on the rule that closing a thing
 * is leaving it; `T` also closes, but that listener lives in the HUD, which
 * is the only thing mounted to hear it when the picker is *not* up.
 */
export function EmotePicker() {
  const activeTable = useGameStore((state) => state.activeTable)
  const sendEmote = usePresenceStore((state) => state.sendEmote)
  const closeEmotePicker = useSessionStore((state) => state.closeEmotePicker)

  const emotes = emoteSetFor(activeTable)

  function say(emote: EmoteId): void {
    sendEmote(emote)
    closeEmotePicker()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') {
        closeEmotePicker()
        return
      }
      // '1' through '4', mapped onto the open list. Parsed rather than
      // compared four times; anything outside the list falls through.
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
    </div>
  )
}
