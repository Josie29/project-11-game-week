import { describe, expect, it } from 'vitest'

import {
  formatBankroll,
  leaderboardRows,
  truncateName,
  type LeaderboardPlayer,
} from '../world/leaderboard'

const player = (id: string, name: string, bankroll: number): LeaderboardPlayer => ({
  id,
  name,
  bankroll,
})

describe('the high rollers board', () => {
  // Catches the bug where a fourth player pushes the board past three rows, or
  // where the richest player is not the one drawn on top.
  it('keeps the top three by bankroll, best first', () => {
    const rows = leaderboardRows(player('me', 'Josie', 800), [
      player('a', 'Dutch', 1200),
      player('b', 'Miso', 950),
      player('c', 'Rube', 100),
    ])
    expect(rows.map((r) => r.name)).toEqual(['Dutch', 'Miso', 'Josie'])
    expect(rows.some((r) => r.id === 'c'), 'the fourth player must fall off the board').toBe(false)
  })

  // Two clients holding the same roster must paint the same board — a tie that
  // ordered by arrival would flicker between browsers.
  it('breaks ties by name then id, the same way every time', () => {
    const peers = [player('b2', 'Ace', 500), player('a1', 'Ace', 500)]
    const first = leaderboardRows(player('me', 'Zed', 500), peers)
    const second = leaderboardRows(player('me', 'Zed', 500), [...peers].reverse())
    expect(first.map((r) => r.id)).toEqual(['a1', 'b2', 'me'])
    expect(second.map((r) => r.id), 'roster order must not leak into the board').toEqual(
      first.map((r) => r.id),
    )
  })

  // Protects "solo shows just you": an empty room is one honest row, not a
  // board padded with invented names.
  it('shows only the local player when nobody else is around', () => {
    const rows = leaderboardRows(player('me', 'Josie', 500), [])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isSelf).toBe(true)
    expect(rows[0]?.name).toBe('Josie')
  })

  // Pins the no-padding decision: two players is two rows, never a third.
  it('draws two rows for two players, never a filler third', () => {
    const rows = leaderboardRows(player('me', 'Josie', 500), [player('a', 'Dutch', 700)])
    expect(rows).toHaveLength(2)
  })

  // Pins the strict-top-3 decision so nobody "fixes" the board into always
  // showing the local player pinned at the bottom.
  it('drops the local player when they are outside the top three', () => {
    const rows = leaderboardRows(player('me', 'Josie', 10), [
      player('a', 'Dutch', 400),
      player('b', 'Miso', 300),
      player('c', 'Rube', 200),
    ])
    expect(rows.some((r) => r.isSelf), 'a broke player earns no row').toBe(false)
    expect(rows).toHaveLength(3)
  })
})

describe('the board dollar format', () => {
  // The board must print exactly what the HUD would: whole dollars, grouped.
  it('groups thousands the marquee way', () => {
    expect(formatBankroll(0)).toBe('$0')
    expect(formatBankroll(999)).toBe('$999')
    expect(formatBankroll(12450)).toBe('$12,450')
    expect(formatBankroll(1234567)).toBe('$1,234,567')
  })

  // Catches the bug where a fractional or corrupt amount reaches the paint
  // call and the board shows $62.50 — the exact class of bug the money rules
  // exist to prevent.
  it('floors fractions and refuses to print a negative', () => {
    expect(formatBankroll(62.5)).toBe('$62')
    expect(formatBankroll(-40)).toBe('$0')
    expect(formatBankroll(Number.NaN)).toBe('$0')
  })
})

describe('the board name cut', () => {
  // A sixteen-character name must not push the dollar column off the panel.
  it('cuts a long name with an ellipsis and leaves a short one alone', () => {
    expect(truncateName('Bartholomew Kidd', 10)).toBe('Bartholom…')
    expect(truncateName('Josie', 10)).toBe('Josie')
    expect(truncateName('Josie', 10)).toHaveLength(5)
  })
})
