import { useMemo } from 'react'
import { CatmullRomCurve3, ExtrudeGeometry, Shape, TubeGeometry, Vector3 } from 'three'
import { RoundPhase } from '../../games/blackjack/types'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { getFeltTexture } from '../tableTexture'
import { ChipStack } from './ChipStack'
import { CARD_WIDTH, PlayingCard } from './PlayingCard'

/**
 * Table footprint, in shape-space units before the slab is laid flat.
 *
 * A blackjack table is a D, not a circle: a deep semicircular player side and a
 * shallow bulge behind the dealer. `+y` here is the dealer's edge, which
 * becomes world `-z` once the extrusion is rotated flat.
 */
const HALF_WIDTH = 3.1
const PLAYER_DEPTH = 2
const DEALER_DEPTH = 0.85
const SLAB_THICKNESS = 0.16

export const TABLE_TOP_Y = 1

/** Cards rest a hair above the felt so they never z-fight with it. */
const CARD_Y = TABLE_TOP_Y + 0.016

/*
 * Row spacing is set by what physically fits between the dealer's kit and the
 * printed spots. The tray occupies z -0.83..-0.43 and a card is 0.59 deep, so
 * the dealer's row has to start clear of -0.43.
 */
const DEALER_ROW_Z = 0.02
const PLAYER_ROW_Z = 1.05
/** Sits on the centre betting spot printed in the felt. */
const CHIP_ROW_Z = 1.52

const CARD_SPACING = CARD_WIDTH * 0.66
const DEAL_STAGGER = 0.18
const HIT_DELAY = 0.06

/** Chip-tray troughs, dealer's left to right, in standard casino colours. */
const TRAY_COLORS = ['#e9ecf5', '#a3182f', '#12693f', '#1e4f9c', '#1b1d2e', '#5a2a82'] as const

/** Builds the D-shaped table outline. */
function createTableShape(): Shape {
  const shape = new Shape()
  // Shallow bulge behind the dealer, then the deep player-side arc back round.
  shape.absellipse(0, 0, HALF_WIDTH, DEALER_DEPTH, 0, Math.PI, false)
  shape.absellipse(0, 0, HALF_WIDTH, PLAYER_DEPTH, Math.PI, Math.PI * 2, false)
  return shape
}

function dealDelay(index: number, isDealer: boolean): number {
  if (index >= 2) return HIT_DELAY
  return index * DEAL_STAGGER * 2 + (isDealer ? DEAL_STAGGER : 0)
}

function cardX(index: number, count: number): number {
  return (index - (count - 1) / 2) * CARD_SPACING
}

/** The dealer's chip rack, with chips standing on edge in their troughs. */
function ChipTray() {
  return (
    // Pushed back as far as the dealer's edge allows: at x = 0 the felt ends
    // at z = -0.85, so a 0.4-deep rack centred here just fits.
    <group position={[0.15, TABLE_TOP_Y, -0.63]}>
      {/* Wooden rack. */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.12, 0.4]} />
        <meshStandardMaterial color="#4a2c18" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Recessed dark interior the chips sit in. */}
      <mesh position={[0, 0.125, 0]}>
        <boxGeometry args={[1.5, 0.02, 0.33]} />
        <meshStandardMaterial color="#160c08" roughness={0.9} />
      </mesh>

      {TRAY_COLORS.map((color, trough) => (
        <group key={color} position={[(trough - (TRAY_COLORS.length - 1) / 2) * 0.24, 0.135, 0]}>
          {Array.from({ length: 8 }, (_, slot) => (
            <mesh
              key={slot}
              position={[0, 0, (slot - 3.5) * 0.036]}
              // Stand each chip on edge so a trough reads as a row of rims.
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.085, 0.085, 0.03, 16]} />
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

/** The felt, the rail, the dealer's kit, and everything in play on the table. */
export function BlackjackTable() {
  const game = useBlackjackStore((state) => state.game)
  const isSettled = game.phase === RoundPhase.Settled

  const felt = useMemo(() => {
    const texture = getFeltTexture()
    // ExtrudeGeometry writes raw shape coordinates as cap UVs, so rescale them
    // into 0..1 here rather than rewriting the geometry's UV attribute.
    texture.repeat.set(1 / (HALF_WIDTH * 2), 1 / (DEALER_DEPTH + PLAYER_DEPTH))
    texture.offset.set(0.5, PLAYER_DEPTH / (DEALER_DEPTH + PLAYER_DEPTH))
    return texture
  }, [])

  const slabGeometry = useMemo(
    () =>
      new ExtrudeGeometry(createTableShape(), {
        depth: SLAB_THICKNESS,
        bevelEnabled: false,
        curveSegments: 64,
      }),
    [],
  )

  const railGeometry = useMemo(() => {
    // Follow the table outline so the padded rail hugs the D exactly.
    const outline = createTableShape()
      .getPoints(160)
      .map((point) => new Vector3(point.x, 0, -point.y))
    return new TubeGeometry(new CatmullRomCurve3(outline, true), 220, 0.115, 12, true)
  }, [])

  return (
    <group>
      {/* Felt slab, laid flat so the shape's +y becomes the dealer's edge. */}
      <mesh
        geometry={slabGeometry}
        position={[0, TABLE_TOP_Y - SLAB_THICKNESS, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial attach="material-0" map={felt} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color="#123c2b" roughness={0.9} />
      </mesh>

      {/* Padded leather rail. */}
      <mesh geometry={railGeometry} position={[0, TABLE_TOP_Y - 0.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#6d3427" roughness={0.42} metalness={0.08} />
      </mesh>

      {/* Pedestal. */}
      <mesh position={[0, 0.44, 0.1]} castShadow>
        <cylinderGeometry args={[0.8, 1.15, 0.88, 28]} />
        <meshStandardMaterial color="#241528" roughness={0.85} />
      </mesh>

      <ChipTray />

      {/*
        Dealing shoe, the corner cards fly out of. At x = -1.55 the felt edge is
        z = -0.74, so the box is nudged forward to stay on the table.
      */}
      <mesh position={[-1.55, TABLE_TOP_Y + 0.08, -0.4]} rotation={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.44, 0.16, 0.6]} />
        <meshStandardMaterial color="#1b1230" roughness={0.6} metalness={0.2} />
      </mesh>

      {game.dealerHand.map((card, index) => (
        <PlayingCard
          key={`dealer-${index}-${card.rank}${card.suit}`}
          card={card}
          // The hole card stays down until the round resolves.
          faceUp={index !== 1 || isSettled}
          position={[cardX(index, game.dealerHand.length), CARD_Y, DEALER_ROW_Z]}
          delay={dealDelay(index, true)}
          seatIndex={index}
        />
      ))}

      {game.playerHand.map((card, index) => (
        <PlayingCard
          key={`player-${index}-${card.rank}${card.suit}`}
          card={card}
          faceUp
          position={[cardX(index, game.playerHand.length), CARD_Y, PLAYER_ROW_Z]}
          delay={dealDelay(index, false)}
          seatIndex={index + 1}
        />
      ))}

      <ChipStack amount={game.bet} position={[0, TABLE_TOP_Y + 0.016, CHIP_ROW_Z]} />
    </group>
  )
}
