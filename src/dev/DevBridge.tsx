import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

export interface DevRenderBridge {
  /** Draws one frame on demand. */
  render: () => void
  /** Current camera world position, as `[x, y, z]`. */
  cameraPosition: () => [number, number, number]
}

/**
 * Exposes a manual render hook on `window.devRender` during development.
 *
 * Browsers throttle `requestAnimationFrame` to zero in backgrounded tabs, which
 * leaves an automated screenshot showing an empty canvas even though the scene
 * is fine. Forcing a draw makes headless visual checks reliable.
 *
 * Renders nothing and is only mounted under `import.meta.env.DEV`.
 */
export function DevBridge() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const bridge: DevRenderBridge = {
      render: () => gl.render(scene, camera),
      cameraPosition: () => [camera.position.x, camera.position.y, camera.position.z],
    }

    ;(window as unknown as { devRender: DevRenderBridge }).devRender = bridge

    return () => {
      delete (window as unknown as { devRender?: DevRenderBridge }).devRender
    }
  }, [gl, scene, camera])

  return null
}
