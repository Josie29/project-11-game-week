/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      /*
       * Git worktrees live under `.claude/worktrees/`, which means a second
       * checkout of this same project sits inside the one the dev server is
       * watching. Every file written over there — a build, a config, an
       * index.html — triggered a full page reload here, which is fatal to a
       * capture: `npm run shot` waits for a canvas, and a forced reload throws
       * the canvas away while it is waiting.
       */
      ignored: ['**/.claude/**'],
    },
  },
  test: {
    // The game-rule engines are pure TypeScript with no DOM dependency,
    // so the lighter node environment is all the test suite needs.
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
