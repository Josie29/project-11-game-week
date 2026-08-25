import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runSequence } from '../store/sequence'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runSequence', () => {
  it('runs steps in order, at the times given', () => {
    const ran: string[] = []
    runSequence([
      { at: 300, run: () => ran.push('second') },
      { at: 100, run: () => ran.push('first') },
      { at: 600, run: () => ran.push('third') },
    ])

    vi.advanceTimersByTime(99)
    expect(ran).toEqual([])

    vi.advanceTimersByTime(1)
    expect(ran).toEqual(['first'])

    vi.advanceTimersByTime(200)
    expect(ran).toEqual(['first', 'second'])

    vi.advanceTimersByTime(300)
    expect(ran).toEqual(['first', 'second', 'third'])
  })

  // Times are absolute from the start, so a long chain does not drift later and
  // later as each step's delay is added to the last.
  it('measures every step from the start, not from the step before', () => {
    const at: number[] = []
    const started = Date.now()
    vi.setSystemTime(started)

    runSequence([
      { at: 100, run: () => at.push(Date.now() - started) },
      { at: 150, run: () => at.push(Date.now() - started) },
      { at: 1000, run: () => at.push(Date.now() - started) },
    ])

    vi.advanceTimersByTime(1000)
    expect(at).toEqual([100, 150, 1000])
  })

  /*
   * The property the whole helper exists for. Walking out of a casino
   * mid-animation must not leave a timer that fires against a round which no
   * longer exists — that would credit a payout into the next hand.
   */
  it('stops every remaining step when cancelled', () => {
    const ran: string[] = []
    const sequence = runSequence([
      { at: 100, run: () => ran.push('a') },
      { at: 200, run: () => ran.push('b') },
      { at: 300, run: () => ran.push('c') },
    ])

    vi.advanceTimersByTime(150)
    expect(ran).toEqual(['a'])

    sequence.cancel()
    vi.advanceTimersByTime(1000)

    expect(ran).toEqual(['a'])
    expect(sequence.isRunning()).toBe(false)
  })

  // The same protection without an explicit cancel: the round changed under it.
  it('abandons the rest once the guard stops holding', () => {
    const ran: string[] = []
    let valid = true

    runSequence(
      [
        { at: 100, run: () => ran.push('a') },
        { at: 200, run: () => ran.push('b') },
        { at: 300, run: () => ran.push('c') },
      ],
      { isStillValid: () => valid },
    )

    vi.advanceTimersByTime(100)
    expect(ran).toEqual(['a'])

    valid = false
    vi.advanceTimersByTime(1000)
    expect(ran).toEqual(['a'])
  })

  it('reports when it has finished on its own', () => {
    const sequence = runSequence([{ at: 50, run: () => {} }])
    expect(sequence.isRunning()).toBe(true)

    vi.advanceTimersByTime(50)
    expect(sequence.isRunning()).toBe(false)
  })

  it('survives being cancelled twice, or after it finished', () => {
    const sequence = runSequence([{ at: 10, run: () => {} }])
    vi.advanceTimersByTime(10)

    expect(() => {
      sequence.cancel()
      sequence.cancel()
    }).not.toThrow()
  })

  it('handles an empty sequence', () => {
    const sequence = runSequence([])
    expect(sequence.isRunning()).toBe(false)
    expect(() => sequence.cancel()).not.toThrow()
  })
})
