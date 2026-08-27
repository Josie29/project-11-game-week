import { useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import { MathUtils } from 'three'
import { onRecentre } from '../world/touchMove'

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

    /*
     * Every pointer currently down on the canvas, so a pinch can be measured.
     *
     * A phone has no scroll wheel, and zoom is not a nicety here: the table
     * cameras open wide to hold the felt on a narrow screen, and reading a card
     * means being able to lean in. Two fingers is the gesture everybody already
     * knows.
     */
    const down = new Map<number, { x: number; y: number }>()
    let pinchSpan: number | null = null

    /** The distance between the first two fingers down, or null. */
    function spanOf(): number | null {
      const points = [...down.values()]
      const first = points[0]
      const second = points[1]
      if (!first || !second) return null

      return Math.hypot(second.x - first.x, second.y - first.y)
    }

    function onPointerDown(event: PointerEvent): void {
      down.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (down.size >= 2) {
        // A second finger ends the drag it interrupts, so releasing one of a
        // pinch does not swing the view by the gap between them.
        activePointer = null
        pinchSpan = spanOf()
        return
      }

      activePointer = event.pointerId
      lastX = event.clientX
      lastY = event.clientY
      element.setPointerCapture(event.pointerId)
    }

    function onPointerMove(event: PointerEvent): void {
      if (down.has(event.pointerId)) {
        down.set(event.pointerId, { x: event.clientX, y: event.clientY })
      }

      if (down.size >= 2) {
        const span = spanOf()
        if (span !== null && pinchSpan !== null && span > 0) {
          const { minDistance, maxDistance } = limitsRef.current
          // Fingers apart means closer, the same sense as scrolling up.
          orbit.current.distance = MathUtils.clamp(
            orbit.current.distance * (pinchSpan / span),
            minDistance,
            maxDistance,
          )
          lastInputAt.current = performance.now()
        }
        pinchSpan = span
        return
      }

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
      down.delete(event.pointerId)
      if (down.size < 2) pinchSpan = null

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

    function reset(): void {
      orbit.current = { ...defaultsRef.current }
      lastInputAt.current = 0
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== 'r' || event.metaKey || event.ctrlKey) return
      reset()
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('pointercancel', onPointerUp)
    element.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    // The touch overlay's Recentre button, which is this key by another name.
    const unsubscribe = onRecentre(reset)

    return () => {
      unsubscribe()
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
