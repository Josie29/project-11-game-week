import { INTERACT_LABEL } from '../world/controls'

/**
 * What the keys do, and nothing else.
 *
 * Static on purpose. There is no guided tutorial because there is very little
 * to guide: proximity offers and one key accepts, so the whole game is two
 * rows. A sequence that walked a player to a door would be a larger thing than
 * the thing it explains, and one more screen for `npm run walkthrough` to click
 * through.
 */
export function ControlsCard() {
  return (
    <dl className="controls">
      <div className="controls__row">
        <dt className="controls__key">W A S D</dt>
        <dd className="controls__what">Walk</dd>
      </div>
      <div className="controls__row">
        <dt className="controls__key">Drag</dt>
        <dd className="controls__what">Look around · R to reset the camera</dd>
      </div>
      <div className="controls__row">
        <dt className="controls__key">{INTERACT_LABEL}</dt>
        <dd className="controls__what">
          Take whatever is on offer — a door, a table, a chair, the way back out.
          Walk up to something and the prompt says what it is.
        </dd>
      </div>
    </dl>
  )
}
