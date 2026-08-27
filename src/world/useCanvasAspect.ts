import { useThree } from '@react-three/fiber'

/**
 * The shape of the drawing surface, which is not the shape of the window.
 *
 * Every camera in the game has to size itself against *this* rather than
 * against `useLayout`, and the difference is the whole reason the file exists:
 * in portrait the designer and the shop put a sheet across the bottom of the
 * screen and the canvas is inset above it, so the window is 390x844 while the
 * thing being drawn into is 390x464. A camera that took the window's aspect
 * would open wide enough for a frame two hundred pixels taller than the one
 * anybody sees.
 *
 * `useThree(state => state.size)` is R3F's own measurement of the canvas
 * element, so it is correct through resizes, rotations and the sheet appearing.
 *
 * @returns Canvas width divided by canvas height.
 */
export function useCanvasAspect(): number {
  return useThree((state) => (state.size.height > 0 ? state.size.width / state.size.height : 1))
}
