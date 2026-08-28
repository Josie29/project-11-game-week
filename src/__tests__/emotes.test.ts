import { describe, expect, it } from 'vitest'
import { TableId } from '../scenes/casinoFloorLayout'
import { EMOTE_LABELS, EmoteId, emoteSetFor, sanitizeEmote } from '../world/emotes'

describe('emote catalogue', () => {
  // The id is what crosses the wire and what the texture cache is keyed by. A
  // duplicate would make two buttons say different things and draw the same
  // bubble.
  it('has unique ids', () => {
    const ids = Object.values(EmoteId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The picker numbers its entries 1-4. A fifth entry would be an emote no
  // digit can reach, and a shorter list leaves a dead number badge.
  it('offers exactly four emotes in every set', () => {
    for (const table of [null, TableId.Blackjack, TableId.Craps]) {
      expect(emoteSetFor(table)).toHaveLength(4)
    }
  })

  // A label is what the bubble draws. An unlabelled id would render an empty
  // pill above someone's head — visible to everyone, attributable to no one.
  it('labels every emote', () => {
    for (const id of Object.values(EmoteId)) {
      expect(EMOTE_LABELS[id], id).toBeTruthy()
    }
  })

  // The whole point of three sets: craps talk at the craps rail, table talk at
  // blackjack, and a wave everywhere else. A set leaking across tables makes
  // "seven out" offerable in the dress shop.
  it('changes the set with the table', () => {
    expect(emoteSetFor(TableId.Blackjack)).toContain(EmoteId.NiceHit)
    expect(emoteSetFor(TableId.Craps)).toContain(EmoteId.SevenOut)
    expect(emoteSetFor(null)).toContain(EmoteId.Wave)
    expect(emoteSetFor(null)).not.toContain(EmoteId.NiceHit)
    expect(emoteSetFor(TableId.Blackjack)).not.toContain(EmoteId.SevenOut)
  })

  // Every offerable emote must survive the receiving client's sanitizer, or a
  // legitimate callout is silently dropped on arrival.
  it('accepts every catalogued emote across every set', () => {
    for (const table of [null, TableId.Blackjack, TableId.Craps]) {
      for (const id of emoteSetFor(table)) {
        expect(sanitizeEmote(id)).toBe(id)
      }
    }
  })

  // The id arrives from another client via a room that relays without reading.
  // Anything unrecognised must coerce to null — a sanitizer that lets one junk
  // value through hands a hostile peer a canvas texture.
  it('rejects everything that is not a catalogued emote', () => {
    for (const junk of [7, 'WAVE', '', 'wave ', null, undefined, {}, ['wave']]) {
      expect(sanitizeEmote(junk), String(junk)).toBeNull()
    }
  })
})
