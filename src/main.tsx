import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyBootShortcut } from './dev/bootShortcut'
import { startSaveSync } from './store/saveSync'
import { useGameStore } from './store/useGameStore'
import './styles.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found in index.html')
}

if (import.meta.env.DEV) {
  // Dev-only handle for driving the game from the console or a browser harness,
  // e.g. jumping straight to a table without walking there first. Stripped from
  // production builds by the DEV guard.
  ;(window as unknown as { gameStore: typeof useGameStore }).gameStore = useGameStore
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
