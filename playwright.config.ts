import { defineConfig, devices } from '@playwright/test'

const port = 4173
const API_SPECS = /\.api\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: API_SPECS },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: API_SPECS },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: API_SPECS },
    // API journeys share the server's single database, so they run once and are never retried
    // (the first signup becomes the admin only once).
    { name: 'api', testMatch: API_SPECS, retries: 0 },
  ],
  // Runs the production build, the same way the Docker image does.
  webServer: {
    command: 'pnpm build && pnpm start',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      AGENDINA_WEB_DIR: 'apps/web/dist',
      AGENDINA_VERSION: 'e2e',
      // A fresh database per run, so tests never see state from earlier runs.
      AGENDINA_DATABASE_URL: 'sqlite::memory:',
    },
  },
})
