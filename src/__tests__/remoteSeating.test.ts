import { describe, expect, it } from 'vitest'
import { CHAIR_FOOTPRINT_HALF_X, CHAIR_FOOTPRINT_HALF_Z, CHAIR_X, CHAIR_Z, RECLINER_TURN } from '../scenes/clinicLayout'
import type { RemoteIdentity } from '../world/presence'
import { seatedAt } from '../world/remoteSeating'

/*
 * Where a seated peer is drawn — the clinic branch (issue #6).
 *
 * The bug was invisible to every other test: the identity said `seated`, the
 * figure rendered, and only the *coordinates* were wrong — a donor drawn
 * sitting on the floor beside the recliner, facing the wrong way, while the
 * chair stayed empty.
 */

const donor = (chair: number | null): RemoteIdentity => ({
  id: 'peer',
  name: 'Nicole',
  appearance: {} as RemoteIdentity['appearance'],
  equipped: {} as RemoteIdentity['equipped'],
  seated: true,
  table: null,
  chair,
  bankroll: 500,
})

describe('a peer in a clinic recliner', () => {
  // Catches issue #6: Nicole in chair 2 must be drawn *in* chair 2 — inside
  // its footprint — not at her last walking pose beside it.
  it('is drawn inside the chair they actually took', () => {
    for (const chair of CHAIR_Z.keys()) {
      const placed = seatedAt(donor(chair), {}, [], null)
      expect(placed, `chair ${chair} drew nobody`).not.toBeNull()

      const [x, , z] = placed?.at ?? [Number.NaN, Number.NaN, Number.NaN]
      expect(Math.abs(x - CHAIR_X), `chair ${chair} sits the donor off its cushion in x`)
        .toBeLessThanOrEqual(CHAIR_FOOTPRINT_HALF_X)
      expect(Math.abs(z - (CHAIR_Z[chair] ?? Number.NaN)), `chair ${chair} sits the donor off in z`)
        .toBeLessThanOrEqual(CHAIR_FOOTPRINT_HALF_Z)
    }
  })

  // Facing the way the chair faces — the issue's other visible half: the
  // donor rendered "facing the wrong way".
  it('faces the way the recliner is turned', () => {
    expect(seatedAt(donor(0), {}, [], null)?.facing).toBe(RECLINER_TURN)
  })

  // A chair the clinic does not have draws nobody, rather than stacking a
  // second donor into recliner zero on top of its real occupant.
  it('draws nobody for a chair that does not exist', () => {
    expect(seatedAt(donor(CHAIR_Z.length), {}, [], null)).toBeNull()
  })

  // The paired negative for the whole branch: a seated peer with no chair and
  // no table still resolves nowhere, exactly as before the field existed.
  it('places a seated peer with no chair and no table nowhere', () => {
    expect(seatedAt(donor(null), {}, [], null)).toBeNull()
  })
})
