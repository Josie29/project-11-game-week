import { create } from 'zustand'
import {
  GAME_MINUTES_PER_REAL_SECOND,
  STARTING_MINUTE,
  wrapMinute,
} from '../world/timeOfDay'

interface TimeStore {
  /** Minutes since midnight, always a whole number in [0, 1440). */
  minuteOfDay: number
  /** When set, `advance` is inert. Used by `?time=` so captures are stable. */
  paused: boolean

  /** Advances the clock by a frame's worth of real time. */
  advance: (deltaSeconds: number) => void
  setMinuteOfDay: (minute: number) => void
  setPaused: (paused: boolean) => void
}

/**
 * Sub-minute remainder, held outside the store on purpose.
 *
 * `advance` runs every frame but the store is only written when the displayed
 * minute actually changes — once a real second rather than sixty times. Keeping
 * the fraction here is what makes that possible; putting it in the store would
 * reintroduce the per-frame write it exists to avoid. Same reasoning as the
 * identity bail-out in `useGameStore.setNearbyCasino`.
 */
let carry = 0

export const useTimeStore = create<TimeStore>()((set, get) => ({
  minuteOfDay: STARTING_MINUTE,
  paused: false,

  advance: (deltaSeconds) => {
    if (get().paused) return
    // A backgrounded tab hands back one enormous delta on return; clamping it
    // keeps the clock from leaping hours between two consecutive frames.
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
    carry += Math.min(deltaSeconds, 1) * GAME_MINUTES_PER_REAL_SECOND

    if (carry < 1) return

    const whole = Math.floor(carry)
    carry -= whole
    set({ minuteOfDay: wrapMinute(get().minuteOfDay + whole) })
  },

  setMinuteOfDay: (minute) => {
    carry = 0
    set({ minuteOfDay: wrapMinute(minute) })
  },

  setPaused: (paused) => set({ paused }),
}))
