import { advance, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

export interface DevRenderBridge {
  /** Draws one frame on demand without advancing animation. */
  render: () => void
  /**
   * Runs the frame loop manually for `frames` steps of `delta` seconds each,
   * so `useFrame` animations settle even when the browser is not painting.
   */
  step: (frames?: number, delta?: number) => void
  /** Current camera world position, as `[x, y, z]`. */
  cameraPosition: () => [number, number, number]
}

/**
 * Exposes manual render and step hooks on `window.devRender` during development.
 *
 * Browsers throttle `requestAnimationFrame` to zero in backgrounded tabs, so an
 * automated screenshot otherwise catches the scene mid-deal or blank. Driving
 * the loop by hand makes headless visual checks deterministic.
 *
 * Renders nothing and is only mounted under `import.meta.env.DEV`.
 */
export function DevBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    // R3F derives each frame's delta from the timestamp it is handed, so the
    // clock has to keep moving forward across calls.
    let clockMs = performance.now()

    const bridge: DevRenderBridge = {
      render: () => gl.render(scene, camera),
      step: (frames = 90, delta = 1 / 60) => {
        for (let i = 0; i < frames; i++) {
          clockMs += delta * 1000
          advance(clockMs)
        }
      },
      cameraPosition: () => [camera.position.x, camera.position.y, camera.position.z],
    }

    ;(window as unknown as { devRender: DevRenderBridge }).devRender = bridge

    return () => {
      delete (window as unknown as { devRender?: DevRenderBridge }).devRender
    }
  }, [gl, scene, camera])

  return null
}
