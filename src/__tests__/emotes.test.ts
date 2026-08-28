import { describe, expect, it } from 'vitest'
import { TableId } from '../scenes/casinoFloorLayout'
import {
  EMOTE_LABELS,
  EmoteId,
  emoteSetFor,
  INVITE_RESPONSES,
  inviteTable,
  sanitizeEmote,
  sanitizeSaid,
  sanitizeSayText,
  SAY_MAX_CHARS,
  SAY_PREFIX,
} from '../world/emotes'

describe('emote catalogue', () => {
  // The id is what crosses the wire and what the texture cache is keyed by. A
  // duplicate would make two buttons say different things and draw the same
  // bubble.
  it('has unique ids', () => {
    const ids = Object.values(EmoteId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // The picker numbers its entries. A tenth would be an emote no digit can
  // reach, and an empty set is a picker that opens onto nothing.
  it('keeps every set inside the digits', () => {
    for (const table of [null, TableId.Blackjack, TableId.Craps]) {
      const set = emoteSetFor(table)
      expect(set.length).toBeGreaterThan(0)
      expect(set.length).toBeLessThanOrEqual(9)
    }
  })

  // A label is what the bubble draws. An unlabelled id would render an empty
  // pill above someone's head — visible to everyone, attributable to no one.
  it('labels every emote', () => {
    for (const id of Object.values(EmoteId)) {
      expect(EMOTE_LABELS[id], id).toBeTruthy()
    }
  })

  // No catalogue id may collide with the typed-text prefix, or a legitimate
  // preset would arrive looking like free text and be sanitized as prose.
  it('keeps every id clear of the say prefix', () => {
    for (const id of Object.values(EmoteId)) {
      expect(id.startsWith(SAY_PREFIX), id).toBe(false)
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

describe('invites', () => {
  // An invite is what raises the response card. If one is not offerable from
  // the street, nobody can ever be asked to play.
  it('offers both invites in the general set', () => {
    expect(emoteSetFor(null)).toContain(EmoteId.BlackjackInvite)
    expect(emoteSetFor(null)).toContain(EmoteId.CrapsInvite)
  })

  // The response card names the game it is answering. An invite mapped to the
  // wrong table would say "Blackjack?" over an offer to shoot craps.
  it('maps each invite to its table, and nothing else to any', () => {
    expect(inviteTable(EmoteId.BlackjackInvite)).toBe(TableId.Blackjack)
    expect(inviteTable(EmoteId.CrapsInvite)).toBe(TableId.Craps)
    for (const id of Object.values(EmoteId)) {
      if (id === EmoteId.BlackjackInvite || id === EmoteId.CrapsInvite) continue
      expect(inviteTable(id), id).toBeNull()
    }
  })

  // A response that is itself an invite would raise a card on the original
  // asker, whose answer raises one back — a modal ping-pong nobody asked for.
  it('offers responses that are never themselves invites', () => {
    expect(INVITE_RESPONSES.length).toBeGreaterThan(0)
    for (const response of INVITE_RESPONSES) {
      expect(inviteTable(response), response).toBeNull()
      expect(EMOTE_LABELS[response]).toBeTruthy()
    }
  })
})

describe('sanitizeSayText', () => {
  // Typed text is drawn to a canvas over somebody's head on other people's
  // screens — the exact situation sanitizePlayerName exists for, so the same
  // rules hold: strip controls, collapse whitespace, cap the length.
  it('strips control characters and collapses whitespace', () => {
    expect(sanitizeSayText('nice\nroll\tthere')).toBe('nice roll there')
    expect(sanitizeSayText('  double   win  ')).toBe('double win')
  })

  it('caps the length', () => {
    const long = 'a'.repeat(SAY_MAX_CHARS * 3)
    expect(sanitizeSayText(long)).toHaveLength(SAY_MAX_CHARS)
  })

  // Nothing to say must read as silence, not as an empty pill over a head.
  it('returns null for nothing', () => {
    for (const junk of ['', '   ', '\n\t', 7, null, undefined]) {
      expect(sanitizeSayText(junk), String(junk)).toBeNull()
    }
  })
})

describe('sanitizeSaid', () => {
  // The one gate for both kinds of speech: presets resolve to their label,
  // typed text is sanitized, junk is silence.
  it('resolves a preset to its label', () => {
    expect(sanitizeSaid('wave')).toEqual({ emote: EmoteId.Wave, text: EMOTE_LABELS[EmoteId.Wave] })
  })

  it('sanitizes prefixed text as typed speech', () => {
    expect(sanitizeSaid('say:nice  roll')).toEqual({ emote: null, text: 'nice roll' })
    expect(sanitizeSaid('say:')).toBeNull()
    expect(sanitizeSaid('say: \n ')).toBeNull()
  })

  it('reads everything else as silence', () => {
    for (const junk of [7, 'WAVE', '', null, undefined, {}]) {
      expect(sanitizeSaid(junk), String(junk)).toBeNull()
    }
  })
})
