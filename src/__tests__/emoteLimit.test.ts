import { describe, expect, it } from 'vitest'
import { admitEmote, EMOTE_BURST, EMOTE_WINDOW_MS } from '../../worker/emoteLimit'

describe('admitEmote', () => {
  // The done criterion on issue #16: holding the key cannot flood the table.
  // Three land, the fourth inside the window is dropped by the room.
  it('admits a burst and denies the message after it', () => {
    let sent: readonly number[] = []
    for (let i = 0; i < EMOTE_BURST; i++) {
      const verdict = admitEmote(sent, 1_000 + i * 50)
      expect(verdict.ok).toBe(true)
      sent = verdict.sent
    }

    expect(admitEmote(sent, 1_000 + EMOTE_BURST * 50).ok).toBe(false)
  })

  // A denial is a wait, not a mute: once the oldest admitted emote is a window
  // old, the player can speak again. A limit that never resets is a kick.
  it('re-admits once the window has slid past', () => {
    const sent = [1_000, 1_050, 1_100]
    expect(admitEmote(sent, 1_150).ok).toBe(false)
    expect(admitEmote(sent, 1_000 + EMOTE_WINDOW_MS).ok).toBe(true)
  })

  // A denial must not extend the wait: the pruned history it returns is what
  // gets written back, and if the denied attempt were stamped into it, holding
  // the key would keep the player muted forever.
  it('does not count a denied emote against the window', () => {
    const denied = admitEmote([1_000, 1_050, 1_100], 1_150)
    expect(denied.sent).toEqual([1_000, 1_050, 1_100])
  })

  // Attachments serialized before this field existed come back from
  // hibernation without it. The first emote after the deploy must land, not
  // crash the socket handler.
  it('treats a missing history as empty', () => {
    const verdict = admitEmote(undefined, 5_000)
    expect(verdict.ok).toBe(true)
    expect(verdict.sent).toEqual([5_000])
  })

  // The history is serialized into the attachment on every emote; a list that
  // grew without bound would be a slow leak into every serializeAttachment.
  it('never returns more timestamps than the burst allows', () => {
    let sent: readonly number[] = []
    for (let now = 0; now < EMOTE_WINDOW_MS * 3; now += 1_000) {
      sent = admitEmote(sent, now).sent
      expect(sent.length).toBeLessThanOrEqual(EMOTE_BURST)
    }
  })
})
