import { describe, expect, it } from 'vitest'
import { PlayMode, sanitizeMode } from '../store/useSessionStore'

describe('sanitizeMode', () => {
  // The mode decides whether a WebSocket is opened at all, and it comes back
  // out of user-writable localStorage. A save that says anything other than the
  // two known values must land on Single, so the worst a hand-edited or
  // stale save can do is decline to connect.
  it('fails closed on anything it does not recognise', () => {
    const junk: readonly unknown[] = [
      undefined,
      null,
      '',
      'Multiplayer',
      'multiplayer ',
      'coop',
      0,
      1,
      true,
      {},
      [],
      { mode: PlayMode.Multiplayer },
    ]

    for (const value of junk) {
      expect(sanitizeMode(value)).toBe(PlayMode.Single)
    }
  })

  // The other half of the same guarantee: a player who chose to share the strip
  // and reloaded must still be sharing it, or the choice silently un-makes
  // itself on every refresh and the toggle looks broken.
  it('keeps a genuine multiplayer choice across a reload', () => {
    expect(sanitizeMode(PlayMode.Multiplayer)).toBe(PlayMode.Multiplayer)
    expect(sanitizeMode(PlayMode.Single)).toBe(PlayMode.Single)
  })

  // Guards the enum's own wire values. These strings are what sit in
  // localStorage, so renaming a member is a save-compatibility change rather
  // than a rename — an existing player's choice would read as junk and reset.
  it('round-trips the values that are actually persisted', () => {
    expect(sanitizeMode('single')).toBe(PlayMode.Single)
    expect(sanitizeMode('multiplayer')).toBe(PlayMode.Multiplayer)
  })
})
