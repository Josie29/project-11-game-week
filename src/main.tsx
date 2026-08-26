import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyBootShortcut } from './dev/bootShortcut'
import { startSaveSync } from './store/saveSync'
import { useAppearanceStore } from './store/useAppearanceStore'
import { useCrapsStore } from './store/useCrapsStore'
import { useSessionStore } from './store/useSessionStore'
import { poseBuffer, usePresenceStore } from './store/usePresenceStore'
import { useGameStore } from './store/useGameStore'
import { INTERPOLATION_DELAY_MS, interpolateAt } from './world/presence'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found in index.html')
}

if (import.meta.env.DEV) {
  // Dev-only handle for driving the game from the console or a browser harness,
  // e.g. jumping straight to a table without walking there first. Stripped from
  // production builds by the DEV guard.
  const bridge = window as unknown as Record<string, unknown>
  bridge.gameStore = useGameStore
  bridge.appearanceStore = useAppearanceStore
  bridge.presenceStore = usePresenceStore
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
