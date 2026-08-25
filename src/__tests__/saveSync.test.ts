import { describe, expect, it } from 'vitest'
import {
  resolveSave,
  rowFromSave,
  type SaveData,
  SaveResolution,
  sanitizeSave,
  saveFromRow,
  STARTING_BANKROLL,
} from '../world/saveSync'
import { DEFAULT_APPEARANCE, HairStyle } from '../character/appearance'
import { Slot } from '../character/catalog'

/*
 * The rules that decide where a bankroll goes when two devices disagree.
 *
 * Pure, like the payout ratios and for the same reason: this is the one place
 * in the sync layer that can silently delete money, and a screenshot of a
 * signed-in HUD cannot show that it picked the wrong save.
 */

/** A save with sensible defaults, so each test states only what it is about. */
function save(overrides: Partial<SaveData> = {}): SaveData {
  return {
    bankroll: 500,
    debt: 0,
    appearance: DEFAULT_APPEARANCE,
    owned: [],
    equipped: {},
    hasDesigned: false,
    updatedAt: 1_000,
    ...overrides,
  }
}

describe('resolveSave', () => {
  /*
   * The case that makes signing in safe. Without it, a guest who has played up
   * to a real bankroll trades all of it for a fresh $500 the moment they make
   * an account — which reads as being punished for signing in, and is the
   * single most likely reason someone would never do it twice.
   */
  it('uploads the guest save when the account has never saved', () => {
    const local = save({ bankroll: 5_000, updatedAt: 10 })

    const { resolution, save: winner } = resolveSave(local, null)

    expect(resolution).toBe(SaveResolution.Push)
    expect(winner.bankroll).toBe(5_000)
  })

  // Played offline on this device, then reconnected. The device that was
  // actually used has to win, or the session is thrown away on reconnect.
  it('keeps the local save when it is newer', () => {
    const local = save({ bankroll: 900, updatedAt: 2_000 })
    const remote = save({ bankroll: 200, updatedAt: 1_000 })

    const { resolution, save: winner } = resolveSave(local, remote)

    expect(resolution).toBe(SaveResolution.Push)
    expect(winner.bankroll).toBe(900)
  })

  // The whole point of accounts: a second device catches up to the first.
  it('takes the remote save when it is newer', () => {
    const local = save({ bankroll: 200, updatedAt: 1_000 })
    const remote = save({ bankroll: 900, updatedAt: 2_000 })

    const { resolution, save: winner } = resolveSave(local, remote)

    expect(resolution).toBe(SaveResolution.Pull)
    expect(winner.bankroll).toBe(900)
  })

  /*
   * Two already-synced devices look exactly like a tie. Resolving a tie to
   * `Push` instead would write a row on every page load of every signed-in
   * player, which is a database write per refresh for no change at all.
   */
  it('does nothing when the two saves are in step', () => {
    const both = save({ bankroll: 750, updatedAt: 5_000 })

    expect(resolveSave(both, save({ bankroll: 750, updatedAt: 5_000 })).resolution).toBe(
      SaveResolution.InSync,
    )
  })
})

describe('sanitizeSave', () => {
  /*
   * `localStorage` is user-writable and so is any row a browser wrote, so both
   * feed the HUD and the character geometry from an untrusted source. The
   * wardrobe has been coerced since it shipped; the money never was, because it
   * only ever came from this machine. Over a network that stops being true.
   */
  it('turns a hand-edited bankroll into a number the HUD can print', () => {
    expect(sanitizeSave({ bankroll: 'banana' }).bankroll).toBe(STARTING_BANKROLL)
    expect(sanitizeSave({ bankroll: Infinity }).bankroll).toBe(STARTING_BANKROLL)
    expect(sanitizeSave({ bankroll: NaN }).bankroll).toBe(STARTING_BANKROLL)
    // Money is whole dollars: there is no chip for half of one.
    expect(sanitizeSave({ bankroll: 12.7 }).bankroll).toBe(12)
    // A negative bankroll would render as a stash of minus-three chips.
    expect(sanitizeSave({ bankroll: -50 }).bankroll).toBe(0)
    expect(sanitizeSave({ debt: -50 }).debt).toBe(0)
  })

  // Equipping something never bought is how a save edit becomes free
  // merchandise. `sanitizeEquipped` filters against `owned` and this proves the
  // save layer actually passes it the owned list rather than an empty one.
  it('refuses to equip an item the save does not own', () => {
    const clean = sanitizeSave({ owned: [], equipped: { [Slot.Outerwear]: 'sequin-jacket' } })

    expect(clean.equipped).toEqual({})
  })

  // A save naming a since-removed hairstyle has to produce a character with
  // hair, not a hole where the head goes.
  it('falls back to a drawable appearance for junk', () => {
    const clean = sanitizeSave({ appearance: { hairStyle: 'a-style-that-was-deleted' } })

    expect(Object.values(HairStyle)).toContain(clean.appearance.hairStyle)
  })

  // Total: the point of a sanitizer is that no input reaches the caller as an
  // exception. Anything at all in, something playable out.
  it('never throws, whatever it is handed', () => {
    for (const junk of [null, undefined, 0, 'save', [], true, { updatedAt: {} }]) {
      expect(() => sanitizeSave(junk)).not.toThrow()
      expect(sanitizeSave(junk).bankroll).toBe(STARTING_BANKROLL)
    }
  })
})

describe('the row round trip', () => {
  /*
   * Snake case out, camel case back. A mismatch here is invisible in every test
   * that does not actually make the trip — `has_designed` arriving as undefined
   * would send a returning player back through the character designer with
   * their wardrobe intact, which looks like a bug in the designer.
   */
  it('survives a trip through the database shape unchanged', () => {
    const original = save({
      bankroll: 1_234,
      debt: 250,
      owned: ['sequin-jacket'],
      equipped: { [Slot.Outerwear]: 'sequin-jacket' },
      hasDesigned: true,
      updatedAt: 1_700_000_000_000,
    })

    const returned = saveFromRow(rowFromSave(original, 'a-user-id'))

    expect(returned).toEqual(original)
  })

  it('names the primary key column the migration uses', () => {
    expect(rowFromSave(save(), 'a-user-id').user_id).toBe('a-user-id')
  })
})
