/**
 * A cancellable sequence of delayed steps.
 *
 * Four separate places in this codebase needed the same thing — a gesture
 * lead-in before an action lands, chips travelling before a round clears, the
 * dealer turning cards over one at a time, dice tumbling before a payout — and
 * each hand-rolled it. Each was a fresh chance to get the cancellation wrong,
 * and one of them did: an animation parked on the handle that gates player
 * input swallowed every hit and stand for the first 420 ms of a round.
 *
 * Two properties matter and are easy to get wrong by hand:
 *
 * - **Cancellable.** One handle stops the whole chain, however many steps are
 *   left, so walking away mid-animation cannot leave a timer running.
 * - **Guarded.** A step only runs if the world it was scheduled against still
 *   holds. Identity-comparing captured state is an exact check: any change from
 *   any source abandons the rest.
 */

export interface SequenceStep {
  /** Milliseconds from the start of the sequence, not from the previous step. */
  readonly at: number
  readonly run: () => void
}

export interface RunningSequence {
  /** Stops the sequence. Safe to call more than once, or after it finishes. */
  cancel: () => void
  /** True until the last step has run or the sequence was cancelled. */
  isRunning: () => boolean
}

export interface SequenceOptions {
  /**
   * Checked immediately before each step. Returning false abandons the rest of
   * the sequence — used to compare the current round against the one the
   * sequence was scheduled for.
   */
  readonly isStillValid?: () => boolean
}

/** A sequence that is already finished, for the nothing-to-do case. */
const FINISHED: RunningSequence = { cancel: () => {}, isRunning: () => false }

/**
 * Schedules `steps` and returns a handle to stop them.
 *
 * Steps run in ascending `at` order. Timing is measured from the start rather
 * than step to step, so a step's delay does not accumulate the drift of every
 * step before it.
 *
 * @param steps Steps to run. Order does not matter; they are sorted.
 * @param options Optional guard checked before every step.
 */
export function runSequence(
  steps: readonly SequenceStep[],
  options: SequenceOptions = {},
): RunningSequence {
  const ordered = [...steps].sort((a, b) => a.at - b.at)
  if (ordered.length === 0) return FINISHED

  let timer: ReturnType<typeof setTimeout> | null = null
  let index = 0
  let elapsed = 0
  let running = true

  function scheduleNext(): void {
    const step = ordered[index]

    if (!running || !step) {
      running = false
      timer = null
      return
    }

    timer = setTimeout(
      () => {
        timer = null

        // The round may have been abandoned while this was pending.
        if (!running || options.isStillValid?.() === false) {
          running = false
          return
        }

        step.run()
        elapsed = step.at
        index++
        scheduleNext()
      },
      Math.max(0, step.at - elapsed),
    )
  }

  scheduleNext()

  return {
    cancel: () => {
      running = false
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
    isRunning: () => running,
  }
}
