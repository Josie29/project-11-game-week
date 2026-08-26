import { isMultiplayerConfigured } from '../net/room'
import { PlayMode } from '../store/useSessionStore'

interface ModeChoiceProps {
  value: PlayMode
  onPick: (mode: PlayMode) => void
}

/**
 * Single player or multiplayer, and the sentence explaining what that means.
 *
 * Shared by the welcome screen and the settings panel rather than written
 * twice. The wording is the feature here — "no connection is made" is a promise
 * about what the game does, and two copies of a promise drift.
 *
 * A build with no `VITE_MULTIPLAYER_URL` disables the choice and says so. A
 * screen that lets you pick multiplayer and then quietly plays you alone is
 * worse than one that never offered it.
 */
export function ModeChoice({ value, onPick }: ModeChoiceProps) {
  // Never start from a mode this build cannot honour.
  const mode = isMultiplayerConfigured ? value : PlayMode.Single

  return (
    <>
      <div className="welcome__choices">
        <button
          type="button"
          className={`button button--choice${mode === PlayMode.Single ? ' button--choice-on' : ''}`}
          onClick={() => onPick(PlayMode.Single)}
        >
          Single player
        </button>
        <button
          type="button"
          className={`button button--choice${mode === PlayMode.Multiplayer ? ' button--choice-on' : ''}`}
          disabled={!isMultiplayerConfigured}
          onClick={() => onPick(PlayMode.Multiplayer)}
        >
          Multiplayer
        </button>
      </div>

      <p className="welcome__note">
        {!isMultiplayerConfigured
          ? 'Multiplayer is unavailable in this build.'
          : mode === PlayMode.Multiplayer
            ? 'Other players walk the same strip and stand in the same rooms.'
            : 'Nobody else on your strip. No connection is made.'}
      </p>
    </>
  )
}
