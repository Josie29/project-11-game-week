import { create } from 'zustand'
import {
  GAME_MINUTES_PER_REAL_SECOND,
  STARTING_MINUTE,
  wrapMinute,
} from '../world/timeOfDay'

interface TimeStore {
  /** Minutes since midnight, always a whole number in [0, 1440). */
  minuteOfDay: number
  /**
   * Days since the session began, counting up and never wrapping.
   *
   * `minuteOfDay` wraps at midnight, so "once per day" cannot be derived from
   * it — a check against the minute would reset every time the clock passed
   * midnight, which at a game minute per real second is every 24 real minutes.
   * The clinic's daily donation is the thing that needs this.
   */
  day: number
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
 * identity bail-out in `useGameStore.setNearbyVenue`.
 */
let carry = 0

export const useTimeStore = create<TimeStore>()((set, get) => ({
  minuteOfDay: STARTING_MINUTE,
  day: 0,
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

    const previous = get().minuteOfDay
    const next = wrapMinute(previous + whole)
    // Going backwards means the clock crossed midnight.
    const rolledOver = next < previous

    set({ minuteOfDay: next, ...(rolledOver ? { day: get().day + 1 } : {}) })
  },

  /**
   * Jumps the clock without counting a day.
   *
   * `?time=` calls this, and a capture opening at 06:00 has not lived through a
   * night — letting it bump the day would let a single capture donate twice.
   */
  setMinuteOfDay: (minute) => {
    carry = 0
    set({ minuteOfDay: wrapMinute(minute) })
  },

  setPaused: (paused) => set({ paused }),
}))
