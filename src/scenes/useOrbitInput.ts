import { useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils } from 'three'

export interface OrbitState {
  /** Direction the camera looks, as a yaw about Y. */
  yaw: number
  /** Elevation above the look target. Negative tilts the view upward. */
  pitch: number
  /** How far the camera sits from what it is looking at. */
  distance: number
}

export interface OrbitLimits {
  minPitch: number
  maxPitch: number
  minDistance: number
  maxDistance: number
  /**
   * How far yaw may stray either side of its default.
   *
   * Null leaves it unbounded, which is right outdoors where the player can turn
   * to face any direction. Indoors it is capped so the view cannot end up
   * behind the dealer staring into the void.
   */
  yawRange: number | null
}

const DRAG_SENSITIVITY = 0.0055
const ZOOM_SENSITIVITY = 0.0035

export interface OrbitInput {
  orbit: RefObject<OrbitState>
  /**
   * `performance.now()` of the last manual adjustment.
   *
   * Outdoors the camera drifts back behind the player as they walk. Reading
   * this lets that be held off after a deliberate look-around, so the view is
   * not yanked out of the player's hands the moment they let go.
   */
  lastInputAt: RefObject<number>
}

/**
 * Pointer and wheel control for an orbiting camera: drag to look, scroll to
 * zoom, R to reset.
 *
 * Listeners live on the WebGL canvas rather than the window, so dragging across
 * the HUD or a control bar never swings the view.
 */
export function useOrbitInput(defaults: OrbitState, limits: OrbitLimits): OrbitInput {
  const gl = useThree((state) => state.gl)

  const orbit = useRef<OrbitState>({ ...defaults })
  const lastInputAt = useRef(0)

  // Held in refs so the listeners bind once instead of rebinding whenever a
  // caller passes a fresh object literal.
  const defaultsRef = useRef(defaults)
  defaultsRef.current = defaults
  const limitsRef = useRef(limits)
  limitsRef.current = limits

  useEffect(() => {
    const element = gl.domElement
    let activePointer: number | null = null
    let lastX = 0
    let lastY = 0

    function onPointerDown(event: PointerEvent): void {
      activePointer = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      element.setPointerCapture(event.pointerId)
    }

    function onPointerMove(event: PointerEvent): void {
      if (activePointer !== event.pointerId) return

      const deltaX = event.clientX - lastX
      const deltaY = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY

      const { minPitch, maxPitch, yawRange } = limitsRef.current
      const next = orbit.current

      next.yaw -= deltaX * DRAG_SENSITIVITY
      if (yawRange !== null) {
        const center = defaultsRef.current.yaw
        next.yaw = MathUtils.clamp(next.yaw, center - yawRange, center + yawRange)
      }

      next.pitch = MathUtils.clamp(next.pitch + deltaY * DRAG_SENSITIVITY, minPitch, maxPitch)
      lastInputAt.current = performance.now()
    }

    function onPointerUp(event: PointerEvent): void {
      if (activePointer !== event.pointerId) return
      element.releasePointerCapture(event.pointerId)
      activePointer = null
      lastInputAt.current = performance.now()
    }

    function onWheel(event: WheelEvent): void {
      // Otherwise the page scrolls behind the canvas.
      event.preventDefault()

      const { minDistance, maxDistance } = limitsRef.current
      orbit.current.distance = MathUtils.clamp(
        orbit.current.distance + event.deltaY * ZOOM_SENSITIVITY,
        minDistance,
        maxDistance,
      )
      lastInputAt.current = performance.now()
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey) return
      orbit.current = { ...defaultsRef.current }
      lastInputAt.current = 0
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [gl])

  return { orbit, lastInputAt }
}
