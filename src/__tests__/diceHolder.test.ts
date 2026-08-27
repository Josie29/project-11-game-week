import { describe, expect, it } from 'vitest'
import { type DiceStanding, resolveDiceHolder } from '../../worker/dice'

/*
 * Who holds the dice at a shared craps table.
 *
 * The room re-derives its shooter on every announcement, so this rule runs on
 * every join, every departure and every line bet placed or resolved anywhere
 * at the table. Possession has to survive all of that, which no screenshot can
 * show — two captures of the same shooter look identical whether the dice are
 * held or merely happen to have landed on the same player twice.
 */

function standing(id: string, overrides: Partial<DiceStanding> = {}): DiceStanding {
  return { id, holdsDice: false, canShoot: false, ...overrides }
}

describe('resolveDiceHolder', () => {
  // The bug in gh issue 7: a line bet is cleared the moment it resolves, so
  // deciding the shooter from eligibility walked the dice to the next player
  // mid-hand — nothing about a paid pass-line bet is a seven-out.
  it('keeps the dice with the holder after their line bet resolves', () => {
    const line = [
      standing('shooter', { holdsDice: true, canShoot: false }),
      standing('next-in-line', { canShoot: true }),
    ]

    expect(resolveDiceHolder(line)).toBe('shooter')
  })

  // A player joining with a line bet down lands ahead of nobody: the roster
  // moving must not move the dice, however eligible the newcomer is.
  it('keeps the dice with the holder even behind an eligible player in line', () => {
    const line = [
      standing('joiner', { canShoot: true }),
      standing('shooter', { holdsDice: true, canShoot: true }),
    ]

    expect(resolveDiceHolder(line)).toBe('shooter')
  })

  // The seven-out handover: the passer let go, so the pair is loose and goes
  // to the first player in line who can take it. Without the skip, somebody
  // stood at the rail with nothing on the line is left holding dice they are
  // not allowed to throw, and the table freezes on their turn.
  it('offers a loose pair to the first eligible player, skipping the rest', () => {
    const line = [
      standing('watching'),
      standing('bet-down', { canShoot: true }),
      standing('also-bet', { canShoot: true }),
    ]

    expect(resolveDiceHolder(line)).toBe('bet-down')
  })

  // No holder and no line bets is a table with no shooter — the answer that
  // lets the room clear its roll clock and hibernate instead of force-rolling
  // for a player who never existed.
  it('holds nobody responsible at a table with no eligible players', () => {
    expect(resolveDiceHolder([standing('watching'), standing('also-watching')])).toBeNull()
    expect(resolveDiceHolder([])).toBeNull()
  })
})
