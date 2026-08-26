export enum Control {
  Forward = 'forward',
  Back = 'back',
  Left = 'left',
  Right = 'right',
  OrbitLeft = 'orbitLeft',
  OrbitRight = 'orbitRight',
}

/** Key bindings shared by the `KeyboardControls` provider and the player rig. */
export const KEYBOARD_MAP: readonly { name: Control; keys: string[] }[] = [
  { name: Control.Forward, keys: ['ArrowUp', 'w', 'W'] },
  { name: Control.Back, keys: ['ArrowDown', 's', 'S'] },
  { name: Control.Left, keys: ['ArrowLeft', 'a', 'A'] },
  { name: Control.Right, keys: ['ArrowRight', 'd', 'D'] },
  // Manual camera orbit, for looking around without walking.
  { name: Control.OrbitLeft, keys: ['q', 'Q'] },
  { name: Control.OrbitRight, keys: ['e', 'E'] },
]

/**
 * The one key that acts on whatever the player is standing at.
 *
 * Sitting at a table, using a recliner, opening a door and stepping back out of
 * one are all this key. Deliberately one verb rather than several: the game only
 * ever offers one of them at a time, and the prompt on screen says which.
 *
 * Not in `KEYBOARD_MAP`, because that is for state the walk loop samples every
 * frame. This is an edge — see `useActionKey`.
 *
 * F rather than E: E is already `Control.OrbitRight`.
 */
export const INTERACT_KEY = 'f'

/** How the same key is drawn in a prompt. Here so the two cannot drift. */
export const INTERACT_LABEL = 'F'

/**
 * Opens and closes the settings panel.
 *
 * `M` because everything else is taken: `WASD` and the arrows here, `Q`/`E` for
 * the orbit, `R` for the camera, `F` for interact, `H S D P`, space and `1 2 3`
 * at the tables.
 *
 * Deliberately **not** Escape. Escape is bound in three places and means the
 * same thing in all of them — leave the table, stand up out of the chair, drop
 * the craps rail — and there is no Escape-from-anywhere by design. Opening a
 * menu is a different verb, and two verbs on one key is exactly the overlap the
 * interaction rules exist to prevent. Escape still *closes* the panel, because
 * closing it is leaving it.
 */
export const SETTINGS_KEY = 'm'

/** How the settings key is drawn on the button. Here so the two cannot drift. */
export const SETTINGS_LABEL = 'M'
