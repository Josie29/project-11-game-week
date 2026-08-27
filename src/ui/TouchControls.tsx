import { useCallback, useRef } from 'react'
import { stickKnob, stickVector, STICK_IDLE } from '../world/touchInput'
import { setTouchMove } from '../world/touchMove'

/**
 * The on-screen stick.
 *
 * It was the stick *and* a button that put the camera back behind the player,
 * which turned out to be a control with nothing to do. The walking camera
 * already swings back on its own once a deliberate look-around has had its
 * moment — that is what `MANUAL_HOLD_MS` in `WalkingPlayer` is for — and the
 * one camera that does not, the seated one at a table, is up only while these
 * controls are hidden. The button could not appear anywhere its job existed.
 *
 * Three things worth knowing about where this sits in the tree.
 *
 * It is **DOM, above the canvas**. `useOrbitInput` binds its drag-to-look
 * listeners to `gl.domElement` rather than to the window, so a thumb that lands
 * on this element never reaches them — the stick cannot be mistaken for a look
 * gesture, with no coordination between the two and no hit-testing anywhere.
 * That was already true for the HUD and it is why the same trick works here.
 *
 * It writes the movement to a **mutable module** rather than to React state,
 * for the same reason `net/localTransform.ts` is not in a store: a thumb
 * produces pointer events at the display's refresh rate, and routing those
 * through a store would re-render the world to move one figure.
 *
 * And the **knob is written straight to the node**, on the same rule. It was
 * `useState` first, which is only two divs and looked harmless — but it is a
 * React render per pointer event, and the render is not free on a machine
 * already struggling to draw the scene. A scripted walk showed it: the same
 * burst that produced no frames at all under the keyboard produced several
 * under the stick, and the follow camera swung between them, so "hold left for
 * 700 ms" walked in a different direction each time. Anything sampled per event
 * belongs outside React here, whether it drives a figure or a highlight.
 */
export function TouchControls() {
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const pointerRef = useRef<number | null>(null)
  const knobRef = useRef<HTMLDivElement>(null)

  /** Moves the knob without a render. Null puts it back in the middle. */
  const drawKnob = useCallback((offset: { x: number; y: number } | null) => {
    const knob = knobRef.current
    if (!knob) return

    knob.style.transform = offset ? `translate(${offset.x}px, ${offset.y}px)` : ''
  }, [])

  const release = useCallback(() => {
    pointerRef.current = null
    originRef.current = null
    setTouchMove(STICK_IDLE)
    drawKnob(null)
  }, [drawKnob])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // One thumb on the stick. A second finger belongs to the camera, and
      // capturing it here would take a pinch away from `useOrbitInput`.
      if (pointerRef.current !== null) return

      const bounds = event.currentTarget.getBoundingClientRect()
      const origin = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }

      pointerRef.current = event.pointerId
      originRef.current = origin
      event.currentTarget.setPointerCapture(event.pointerId)

      setTouchMove(stickVector(origin.x, origin.y, event.clientX, event.clientY))
      drawKnob(stickKnob(origin.x, origin.y, event.clientX, event.clientY))
    },
    [drawKnob],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = originRef.current
      if (origin === null || pointerRef.current !== event.pointerId) return

      setTouchMove(stickVector(origin.x, origin.y, event.clientX, event.clientY))
      drawKnob(stickKnob(origin.x, origin.y, event.clientX, event.clientY))
    },
    [drawKnob],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointerRef.current !== event.pointerId) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      release()
    },
    [release],
  )

  return (
    <div className="touch">
      <div
        className="touch__stick"
        // A control, not decoration — and a real one, so it is announced as
        // such rather than as a div with handlers on it.
        role="application"
        aria-label="Move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={knobRef} className="touch__knob" />
      </div>
    </div>
  )
}
