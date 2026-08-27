import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyBootShortcut } from './dev/bootShortcut'
import { startSaveSync } from './store/saveSync'
import { useAppearanceStore } from './store/useAppearanceStore'
import { useBlackjackStore } from './store/useBlackjackStore'
import { useCrapsStore } from './store/useCrapsStore'
import { useSessionStore } from './store/useSessionStore'
import { useLeaderboardStore } from './store/useLeaderboardStore'
import { poseBuffer, usePresenceStore } from './store/usePresenceStore'
import { useGameStore } from './store/useGameStore'
import { INTERPOLATION_DELAY_MS, interpolateAt } from './world/presence'
import { applySheetFraction } from './world/viewport'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found in index.html')
}

/*
 * Hands the stylesheet the one number it shares with a layout module.
 *
 * On a phone the designer and the shop become sheets across the bottom of the
 * screen and the canvas is inset above them. Those are a CSS rule and a DOM
 * attribute respectively, and if they disagreed about how tall a sheet is, the
 * scene would be composed for a rectangle that is not the one on screen —
 * silently, and only on hardware the captures do not run on.
 */
applySheetFraction(document.documentElement)

if (import.meta.env.DEV) {
  // Dev-only handle for driving the game from the console or a browser harness,
  // e.g. jumping straight to a table without walking there first. Stripped from
  // production builds by the DEV guard.
  const bridge = window as unknown as Record<string, unknown>
  bridge.gameStore = useGameStore
  bridge.appearanceStore = useAppearanceStore
  bridge.presenceStore = usePresenceStore
  // Exposed so a harness can assert who the high-rollers boards are ranking —
  // the standings come from their own room, not the presence roster.
  bridge.leaderboardStore = useLeaderboardStore
  /*
   * Exposed so a harness can change the play mode mid-session, which is the one
   * thing no `?boot=` link can express: the links set up a starting state, and
   * what needs testing here is the *transition* — a player who switches to
   * Single must actually leave the room rather than keep the socket they had.
   */
  bridge.sessionStore = useSessionStore
  // Exposed so a harness can read the table two players are supposed to be
  // sharing: whether they settled the same roll is the whole claim, and it is
  // invisible in a screenshot of dice that have already stopped.
  bridge.crapsStore = useCrapsStore
  bridge.blackjackStore = useBlackjackStore
  /*
   * The interpolated pose of a peer, which is the one thing a harness cannot
   * read off the store: poses deliberately live outside it, in a buffer read
   * each frame. `npm run multiplayer` asserts on this to tell a peer that
   * joined and went silent from one that is actually walking.
   */
  bridge.peerPose = (id: string) =>
    interpolateAt(poseBuffer(id), performance.now() - INTERPOLATION_DELAY_MS)

  applyBootShortcut()
}

/*
 * Deliberately after `applyBootShortcut`, and deliberately not inside a React
 * effect. The shortcut writes the store synchronously; anything that could
 * overwrite it has to be started afterwards, and starting the sync in an effect
 * would put it behind a render that reads the very state it is about to change.
 */
startSaveSync()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
