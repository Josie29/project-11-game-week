/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** This file's own directory, with a trailing slash. */
const PROJECT_ROOT = new URL('.', import.meta.url).pathname

export default defineConfig({
  plugins: [react()],
  server: {
    /*
     * Pinned, because two things disagreed about it.
     *
     * `CLAUDE.md` says 5180 by convention and `scripts/shots.mjs` defaults to
     * it, while `npm run dev` with no port set landed on Vite's own 5173 — so
     * every capture script run against the documented port hit
     * ERR_CONNECTION_REFUSED and the fix each time was to remember to pass the
     * URL by hand. `strictPort` makes a clash an error rather than a silent
     * hop to 5181, which is the same failure wearing a different number.
     */
    port: 5180,
    strictPort: true,
    watch: {
      /*
       * Git worktrees live under `.claude/worktrees/`, which means a second
       * checkout of this same project sits inside the one the dev server is
       * watching. Every file written over there — a build, a config, an
       * index.html — triggered a full page reload here, which is fatal to a
       * capture: `npm run shot` waits for a canvas, and a forced reload throws
       * the canvas away while it is waiting.
       *
       * Anchored to this file's own directory rather than written as a bare
       * `'**' + '/.claude/**'` glob, which is what it was first and which is a
       * trap. A dev server started *inside* a worktree has
       * `.claude/worktrees/<name>/` in the path of every one of its own source
       * files, so that glob told it to ignore the entire project. It went on
       * serving whatever it had already transformed, which is indistinguishable
       * from code that does not run: an hour went into a component that was
       * fine and had simply never been reloaded.
       */
      ignored: [(file: string) => file.startsWith(`${PROJECT_ROOT}.claude/`)],
    },
  },
  test: {
    // The game-rule engines are pure TypeScript with no DOM dependency,
    // so the lighter node environment is all the test suite needs.
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
