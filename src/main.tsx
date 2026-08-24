import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyBootShortcut } from './dev/bootShortcut'
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

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
