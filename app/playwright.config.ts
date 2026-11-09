import { defineConfig, devices } from '@playwright/test'

const DEMO = 'http://localhost:5174'
const API = 'http://localhost:5175'

export default defineConfig({
  testDir: 'e2e',
  use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } },
  projects: [
    { name: 'demo', testMatch: /smoke\.spec\.ts$/, use: { baseURL: DEMO } },
    // Portrait phone: the New song and Processing screens are designed for it.
    { name: 'api', testMatch: /new-song\.spec\.ts$/, use: { baseURL: API, viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    // Environment variables beat .env files in Vite, so a local .env.local can't switch the demo to the API.
    { command: 'pnpm dev --port 5174 --strictPort', url: DEMO, reuseExistingServer: true, env: { VITE_API_URL: '', VITE_API_KEY: '' } },
    { command: 'pnpm dev --port 5175 --strictPort', url: API, reuseExistingServer: false, env: { VITE_API_URL: 'http://api.test', VITE_API_KEY: 'e2e-key' } },
  ],
})
