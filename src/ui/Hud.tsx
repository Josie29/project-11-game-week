import { Location, useGameStore } from '../store/useGameStore'
import { getCasino } from '../world/casinos'

/** Persistent overlay: bankroll, movement hint, and the door prompt. */
export function Hud() {
  const bankroll = useGameStore((state) => state.bankroll)
  const location = useGameStore((state) => state.location)
  const nearbyCasino = useGameStore((state) => state.nearbyCasino)

  const nearby = nearbyCasino ? getCasino(nearbyCasino) : null

  return (
    <div className="hud">
      <div className="hud__bankroll">
        <span className="hud__label">Bankroll</span>
        <span className="hud__amount">${bankroll.toLocaleString()}</span>
      </div>

      {location === Location.Strip && (
        <div className="hud__hint">WASD to walk &middot; Q and E to look around</div>
      )}

      {location === Location.Interior && (
        <div className="hud__hint">Drag to look &middot; scroll to zoom &middot; R to reset</div>
      )}

      {nearby && (
        <div className="hud__prompt" style={{ borderColor: nearby.neonColor }}>
          <strong style={{ color: nearby.neonColor }}>{nearby.name}</strong>
          <span>{nearby.available ? 'Walk in to play' : 'Closed tonight'}</span>
        </div>
      )}
    </div>
  )
}
