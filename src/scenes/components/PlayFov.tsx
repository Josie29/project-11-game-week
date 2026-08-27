import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { PerspectiveCamera } from 'three'
import { playFov } from '../../world/camera'
import { useCanvasAspect } from '../../world/useCanvasAspect'

/**
 * Keeps the default camera's field of view matched to the canvas it draws into.
 *
 * `App` sets `fov` once as a prop, which is right for a window that never
 * changes shape and wrong for a phone. The walking camera is the one every
 * scene shares — the strip, the casino floor, the shop floor, the clinic floor
 * — and on a narrow canvas `PLAY_FOV` shows twenty-seven degrees across, which
 * is less than the room the player is walking through.
 *
 * A component rather than a prop because the aspect is a property of the canvas
 * and is not known until it has been measured. Renders nothing.
 *
 * The scenes with their own `PerspectiveCamera` — both tables, the fitting
 * mirror, the checkout, an occupied recliner — take `makeDefault`, so this
 * writes to a camera nothing is looking through while any of those is up. It
 * costs one assignment and means the walking camera is already correct the
 * moment the player stands back up.
 */
export function PlayFov() {
  const camera = useThree((state) => state.camera)
  const aspect = useCanvasAspect()

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    const fov = playFov(aspect)
    if (camera.fov === fov) return

    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [camera, aspect])

  return null
}
