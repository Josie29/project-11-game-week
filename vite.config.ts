/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The game-rule engines are pure TypeScript with no DOM dependency,
    // so the lighter node environment is all the test suite needs.
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
