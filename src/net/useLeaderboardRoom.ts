import { useEffect } from 'react'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { useLeaderboardStore } from '../store/useLeaderboardStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'

/**
 * Keeps this client on the shared leaderboard room, wherever it is standing.
 *
 * Mounted once in `App` beside `usePresenceRoom`, and deliberately blind to
 * `roomId`: the whole point is that walking through a door must not drop the
 * player off the boards. The identity it announces is the minimum a board row
 * needs — a name and a bankroll; appearance is left empty because nothing ever
 * draws this roster, and sending it would re-announce on every jacket.
 */
export function useLeaderboardRoom(): void {
  const mode = useSessionStore((state) => state.mode)
  const name = useAppearanceStore((state) => state.playerName)
  const bankroll = useGameStore((state) => state.bankroll)

  useEffect(() => {
    const { enter, leave } = useLeaderboardStore.getState()

    // Leaves rather than merely declining to join, for the reason
    // `usePresenceRoom` spells out: switching to Single mid-session must mean
    // the connection is gone, not that it was never made.
    if (mode !== PlayMode.Multiplayer) {
      leave()
      return
    }

    enter({
      name,
      appearance: {},
      owned: [],
      equipped: {},
      seated: false,
      chair: null,
      bankroll,
      table: null,
      seat: null,
    })
  }, [mode, name, bankroll])

  // Gone for good when the app unmounts, so a hot reload does not strand a
  // socket holding a row on everybody's boards.
  useEffect(() => () => useLeaderboardStore.getState().leave(), [])
}
