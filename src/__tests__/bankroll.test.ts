import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STARTING_BANKROLL, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { donationTimeline, NurseTask } from '../scenes/clinicRoutine'
import { DONATION_FEE, MARKER_AMOUNT } from '../world/money'

/*
 * The store's money rules, as opposed to the arithmetic in `money.ts`.
 *
 * These are integration-level on purpose: they drive the real store the way the
 * panels do, because the bugs worth catching here are about which path a credit
 * takes, not about the sums.
 */

function reset(): void {
  useGameStore.setState({
    bankroll: STARTING_BANKROLL,
    debt: 0,
    lastDonationDay: null,
    atChair: null,
    donation: null,
  })
  useTimeStore.setState({ day: 0 })
}

describe('markers', () => {
  beforeEach(reset)

  it('hands over the money and books the debt', () => {
    useGameStore.getState().takeMarker()

    expect(useGameStore.getState().bankroll).toBe(STARTING_BANKROLL + MARKER_AMOUNT)
    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
  })

  // One at a time. Without this the player can stack markers until no run of
  // wins can clear them, which turns the floor under them into a hole.
  it('refuses a second marker while one is outstanding', () => {
    useGameStore.getState().takeMarker()
    useGameStore.getState().takeMarker()
    useGameStore.getState().takeMarker()

    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
    expect(useGameStore.getState().bankroll).toBe(STARTING_BANKROLL + MARKER_AMOUNT)
  })

  // The marker has to be escapable, and it has to stop taking a cut the moment
  // it is square — otherwise the house keeps skimming a debt of zero forever.
  it('is cleared by winning, and then stops taking a cut', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()

    for (let win = 0; win < 40 && useGameStore.getState().debt > 0; win++) {
      useGameStore.getState().creditWinnings(100)
    }

    expect(useGameStore.getState().debt).toBe(0)

    const before = useGameStore.getState().bankroll
    useGameStore.getState().creditWinnings(100)
    expect(useGameStore.getState().bankroll).toBe(before + 100)
  })
})

describe('donations', () => {
  beforeEach(reset)

  it('pays the fee and stamps the day', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().donate()

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
    expect(useGameStore.getState().lastDonationDay).toBe(0)
  })

  // The daily gate is the mechanic. Without it the clinic is an ATM and going
  // broke stops mattering, which is the thing this whole feature exists to fix.
  it('refuses twice in one day and allows it the next', () => {
    useGameStore.setState({ bankroll: 0 })

    useGameStore.getState().donate()
    useGameStore.getState().donate()
    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)

    useTimeStore.setState({ day: 1 })
    useGameStore.getState().donate()
    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE * 2)
  })

  // A donation must reach the player whatever they owe. Routing it through the
  // debt split would mean a broke player in debt donates and receives half of
  // it — or with a large enough marker, nothing at all — leaving them stuck
  // with no way out at the one place that exists to give them one.
  it('pays out in full even while a marker is outstanding', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().takeMarker()
    useGameStore.setState({ bankroll: 0 })

    useGameStore.getState().donate()

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
    expect(useGameStore.getState().debt).toBe(MARKER_AMOUNT)
  })
})

describe('the draw', () => {
  beforeEach(() => {
    reset()
    vi.useFakeTimers()
    useGameStore.setState({ atChair: 0, donation: null, nurseTask: NurseTask.Patrolling })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pays nothing until the nurse has finished', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()

    const { needleAt, completeAt } = donationTimeline()

    vi.advanceTimersByTime(needleAt)
    expect(useGameStore.getState().bankroll).toBe(0)
    expect(useGameStore.getState().lastDonationDay).toBeNull()

    vi.advanceTimersByTime(completeAt - needleAt)
    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
    expect(useGameStore.getState().lastDonationDay).toBe(0)
  })

  /*
   * The case the guard exists for, and the one no screenshot can show.
   *
   * Standing up mid-needle has to cost nothing and pay nothing. Without the
   * guard the money arrives seconds later, from a nurse who is no longer beside
   * anybody — and with the day stamped up front instead, leaving would burn the
   * donation for nothing.
   */
  it('pays nothing and spends no day if the player gets up mid-draw', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()

    vi.advanceTimersByTime(donationTimeline().needleAt)
    useGameStore.getState().leaveChair()

    vi.advanceTimersByTime(20_000)

    expect(useGameStore.getState().bankroll).toBe(0)
    expect(useGameStore.getState().lastDonationDay).toBeNull()
    expect(useGameStore.getState().donation).toBeNull()
  })

  // ...and having walked away, sitting down again offers it afresh.
  it('can be started again after being abandoned', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()
    useGameStore.getState().leaveChair()

    useGameStore.setState({ atChair: 2 })
    useGameStore.getState().beginDonation()
    vi.advanceTimersByTime(donationTimeline().completeAt)

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  // Mashing the button must not stack sequences and pay several times over.
  it('ignores a second start while one is running', () => {
    useGameStore.setState({ bankroll: 0 })
    useGameStore.getState().beginDonation()
    useGameStore.getState().beginDonation()
    useGameStore.getState().beginDonation()

    vi.advanceTimersByTime(donationTimeline().completeAt + 5000)

    expect(useGameStore.getState().bankroll).toBe(DONATION_FEE)
  })

  it('does nothing at all unless the player is in a chair', () => {
    useGameStore.setState({ bankroll: 0, atChair: null })
    useGameStore.getState().beginDonation()

    expect(useGameStore.getState().donation).toBeNull()
    vi.advanceTimersByTime(20_000)
    expect(useGameStore.getState().bankroll).toBe(0)
  })
})

describe('the clock', () => {
  // `?time=` jumps the clock for captures. If that counted as a day, a single
  // frozen capture could donate, jump, and donate again.
  it('does not count a day when the clock is set directly', () => {
    useTimeStore.setState({ day: 4 })
    useTimeStore.getState().setMinuteOfDay(6 * 60)

    expect(useTimeStore.getState().day).toBe(4)
  })

  // ...but letting it run past midnight must, or the donation never resets.
  it('counts a day when the clock runs past midnight', () => {
    useTimeStore.setState({ day: 0, paused: false })
    useTimeStore.getState().setMinuteOfDay(23 * 60 + 59)

    // A game minute per real second, so a couple of minutes of game time.
    for (let tick = 0; tick < 120; tick++) {
      useTimeStore.getState().advance(1)
    }

    expect(useTimeStore.getState().day).toBe(1)
  })
})
