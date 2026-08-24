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
