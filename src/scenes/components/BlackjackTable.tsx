import { useMemo } from 'react'
import { RoundPhase } from '../../games/blackjack/types'
import { CatmullRomCurve3, ExtrudeGeometry, Shape, TubeGeometry, Vector3 } from 'three'
import { ChipPhase, useBlackjackStore } from '../../store/useBlackjackStore'
import { useGameStore } from '../../store/useGameStore'
import { chipBreakdown, stackHeight } from '../chipLayout'
import {
  CHIP_ROW_Z,
  DEALER_DEPTH,
  DEALER_RACK,
  DEALER_ROW_Z,
  DISCARD_POSITION,
  HALF_WIDTH,
  handAnchorX,
  PAYOUT_NUDGE_X,
  PAYOUT_NUDGE_Z,
  PLAYER_DEPTH,
  PLAYER_ROW_Z,
  SLAB_THICKNESS,
  STASH_ORIGIN,
  SURFACE_Y,
  TABLE_TOP_Y,
} from '../tableLayout'
import { FLIP_DURATION_MS } from '../revealTimeline'
import { getFeltTexture } from '../tableTexture'
import { ChipStack } from './ChipStack'
import { ChipStash } from './ChipStash'
import { DealerKit } from './DealerKit'
import { CARD_WIDTH, PlayingCard } from './PlayingCard'

/*
 * The table's footprint and every anchor on it now live in `../tableLayout`,
 * where they are unit-tested against the felt outline. Hand-derived positions
 * on this table have produced real bugs — cards on the chip rack, a shoe over
 * the edge, a payout off the felt — and none showed up until a screenshot.
 */

/** Cards rest a hair above the felt so they never z-fight with it. */
const CARD_Y = SURFACE_Y

const CARD_SPACING = CARD_WIDTH * 0.82
/** A touch more deliberate than a machine-gun deal. */
const DEAL_STAGGER = 0.26
const HIT_DELAY = 0.06

/** Cards turn as they are dealt; only the hole card gets the slow treatment. */
const DEAL_FLIP_MS = 280
const HOLE_FLIP_MS = FLIP_DURATION_MS

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
  const chipPhase = useBlackjackStore((state) => state.chipPhase)
  const uncollectedPayout = useBlackjackStore((state) => state.uncollectedPayout)
  const dealerCardsShown = useBlackjackStore((state) => state.dealerCardsShown)
  const holeCardUp = useBlackjackStore((state) => state.holeCardUp)
  const revealComplete = useBlackjackStore((state) => state.revealComplete)
  const bankroll = useGameStore((state) => state.bankroll)

  /** The round is being cleared away: chips and cards are both leaving. */
  const isClearing = chipPhase === ChipPhase.Settling

  // Empties the shoe and fills the discard tray as the shoe is played down,
  // and resets itself when `startNextRound` reshuffles at penetration.
  const shoeRemaining =
    game.shoe.length > 0 ? 1 - game.shoeIndex / game.shoe.length : 1

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
        castShadow
        receiveShadow
      >
        <meshStandardMaterial attach="material-0" map={felt} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color="#123c2b" roughness={0.9} />
      </mesh>

      {/* Padded leather rail. */}
      <mesh geometry={railGeometry} position={[0, TABLE_TOP_Y - 0.02, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#5a2a20" roughness={0.5} metalness={0.05} />
      </mesh>

      {/* Pedestal. */}
      <mesh position={[0, 0.44, 0.1]} castShadow>
        <cylinderGeometry args={[0.8, 1.15, 0.88, 28]} />
        <meshStandardMaterial color="#150c18" roughness={0.9} />
      </mesh>

      <ChipTray />

      {/* Shoe and discard tray. Both fill levels come from how far into the
          shoe the round has got, so neither needs state of its own. */}
      <DealerKit shoeRemaining={shoeRemaining} />

      {/* The player's own chips, in their own well. Winnings still out on the
          felt are held back so the same money is not shown twice. */}
      <ChipStash amount={bankroll - uncollectedPayout} />

      {/*
        Sliced rather than rendered whole: the engine resolves the dealer's
        entire hand in one step, so without gating on `dealerCardsShown` every
        drawn card would land in the same frame.
      */}
      {game.dealerHand.slice(0, dealerCardsShown).map((card, index) => (
        <PlayingCard
          key={`dealer-${index}-${card.rank}${card.suit}`}
          card={card}
          // The hole card waits for its beat in the reveal, not for settlement.
          faceUp={index !== 1 || holeCardUp}
          // Turned slowly and deliberately; the rest of the deal stays brisk.
          flipDurationMs={index === 1 ? HOLE_FLIP_MS : DEAL_FLIP_MS}
          position={
            isClearing
              ? DISCARD_POSITION
              : [cardX(index, Math.min(dealerCardsShown, game.dealerHand.length)), CARD_Y, DEALER_ROW_Z]
          }
          delay={dealDelay(index, true)}
          seatIndex={index}
        />
      ))}

      {game.hands.map((hand, handIndex) => {
        const anchorX = handAnchorX(handIndex, game.hands.length)
        const isActive = handIndex === game.activeHandIndex && game.phase === RoundPhase.PlayerTurn

        // Winnings above the returned stake. A push returns the stake and pays
        // nothing extra, so it correctly shows no payout pile.
        const winnings = Math.max(0, hand.payout - hand.bet)

        /*
         * Direction is decided per hand, never globally: a split can win one
         * hand and lose the other, and both sets of chips have to go their own
         * way. Anything that paid out goes home to the stash — which also gets
         * pushes right for free, since a push returns the stake.
         */
        const chipsGoHome = hand.payout > 0
        const restingSpot: readonly [number, number, number] = [anchorX, SURFACE_Y, CHIP_ROW_Z]
        const chipTarget = isClearing
          ? chipsGoHome
            ? STASH_ORIGIN
            : DEALER_RACK
          : restingSpot

        return (
          <group key={`hand-${handIndex}`}>
            {hand.cards.map((card, index) => (
              <PlayingCard
                key={`player-${handIndex}-${index}-${card.rank}${card.suit}`}
                card={card}
                faceUp
                flipDurationMs={DEAL_FLIP_MS}
                position={
                  isClearing
                    ? DISCARD_POSITION
                    : [anchorX + cardX(index, hand.cards.length), CARD_Y, PLAYER_ROW_Z]
                }
                delay={dealDelay(index, false)}
                seatIndex={index + 1}
              />
            ))}

            {/* The wager, pushed out from the stash when the bet was placed. */}
            <ChipStack amount={hand.bet} position={chipTarget} origin={STASH_ORIGIN} />

            {/* Winnings, placed on top of the wager by the dealer. */}
            {winnings > 0 && revealComplete && (
              <ChipStack
                amount={winnings}
                position={
                  isClearing
                    ? chipTarget
                    : [anchorX + PAYOUT_NUDGE_X, SURFACE_Y, CHIP_ROW_Z + PAYOUT_NUDGE_Z]
                }
                origin={DEALER_RACK}
                baseHeight={isClearing ? 0 : stackHeight(chipBreakdown(hand.bet).length)}
              />
            )}

            {/* Marks which hand the player is acting on once there is a choice. */}
            {isActive && game.hands.length > 1 && (
              <mesh
                position={[anchorX, TABLE_TOP_Y + 0.014, CHIP_ROW_Z]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.34, 0.4, 32]} />
                <meshBasicMaterial color="#ffe08a" toneMapped={false} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
