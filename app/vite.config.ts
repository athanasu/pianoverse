/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // A local .env.local must not switch unit tests to the API; tests opt in with vi.stubEnv.
    env: { VITE_API_URL: '', VITE_API_KEY: '' },
  },
})
