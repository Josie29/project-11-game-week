import { RoundPhase } from '../../games/blackjack/types'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { getFeltTexture } from '../tableTexture'
import { ChipStack } from './ChipStack'
import { CARD_WIDTH, PlayingCard } from './PlayingCard'

const TABLE_RADIUS = 2.6
const TABLE_TOP_Y = 1
/** Cards rest a hair above the felt so they never z-fight with it. */
const CARD_Y = TABLE_TOP_Y + 0.016

const DEALER_ROW_Z = -0.95
const PLAYER_ROW_Z = 0.8
const CHIP_ROW_Z = 0.05

/** Cards overlap slightly, the way a real hand is fanned. */
const CARD_SPACING = CARD_WIDTH * 0.66

/** Seconds between the opening cards, so the deal reads one card at a time. */
const DEAL_STAGGER = 0.18

/** Cards drawn after the opening deal land almost immediately. */
const HIT_DELAY = 0.06

/**
 * Delay before a card leaves the shoe.
 *
 * The opening four interleave player, dealer, player, dealer; anything drawn
 * later is a hit and should not wait behind the original stagger.
 */
function dealDelay(index: number, isDealer: boolean): number {
  if (index >= 2) return HIT_DELAY
  return index * DEAL_STAGGER * 2 + (isDealer ? DEAL_STAGGER : 0)
}

/** Centres a hand of `count` cards about x = 0. */
function cardX(index: number, count: number): number {
  return (index - (count - 1) / 2) * CARD_SPACING
}

/** The felt, the cards in play, and the wagered chips. */
export function BlackjackTable() {
  const game = useBlackjackStore((state) => state.game)
  const felt = getFeltTexture()

  const isSettled = game.phase === RoundPhase.Settled

  return (
    <group>
      {/*
        Felt surface. Rotated a quarter turn because the cylinder cap's UVs put
        canvas-up along world +X; this swings the printed rules round to the
        dealer's side where a player would actually read them. The cylinder is
        radially symmetric, so the rotation costs nothing visually.
      */}
      <mesh
        position={[0, TABLE_TOP_Y - 0.08, 0]}
        rotation={[0, Math.PI / 2, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.16, 64]} />
        <meshStandardMaterial attach="material-0" color="#123c2b" roughness={0.9} />
        <meshStandardMaterial attach="material-1" map={felt} roughness={0.95} />
        <meshStandardMaterial attach="material-2" color="#0d2c20" roughness={0.9} />
      </mesh>

      {/* Padded leather rail. */}
      <mesh position={[0, TABLE_TOP_Y - 0.02, 0]} castShadow>
        <torusGeometry args={[TABLE_RADIUS, 0.1, 14, 72]} />
        <meshStandardMaterial color="#42281a" roughness={0.5} metalness={0.15} />
      </mesh>

      {/* Pedestal. */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.75, 1.05, 0.9, 28]} />
        <meshStandardMaterial color="#241528" roughness={0.85} />
      </mesh>

      {/* Dealing shoe, the corner cards fly out of. */}
      <mesh position={[1.95, TABLE_TOP_Y + 0.07, -1.05]} rotation={[0, -0.4, 0]} castShadow>
        <boxGeometry args={[0.42, 0.14, 0.6]} />
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
