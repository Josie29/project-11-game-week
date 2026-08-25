import { useFrame } from '@react-three/fiber'
import { useTimeStore } from '../../store/useTimeStore'

/**
 * The only thing that moves the clock.
 *
 * Mounted beside the scene rather than inside it, so time keeps running while
 * the player is indoors — walk out of a long session and the sky has moved.
 *
 * Driven by the frame delta rather than `performance.now()` deliberately: the
 * headless capture harness advances R3F's loop with a synthetic timestamp, so a
 * wall-clock reading would sit frozen for every screenshot. Reads the store
 * imperatively so the render loop never subscribes to it.
 */
export function TimeDriver() {
  useFrame((_, delta) => {
    useTimeStore.getState().advance(delta)
  })

  return null
}
