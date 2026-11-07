import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174', viewport: { width: 844, height: 390 } },
  webServer: { command: 'pnpm dev --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true },
})
