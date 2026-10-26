import { defineConfig, devices } from '@playwright/test'

const API_SPECS = /\.api\.spec\.ts$/

/**
 * Every project gets its own server process (own port, own in-memory database), so each journey
 * starts on a fresh instance where its first signup becomes the admin. All of them run the
 * production build, the same way the Docker image does; `pnpm e2e` builds it first.
 */
const PROJECTS = [
  { name: 'api', port: 4173, use: {}, testMatch: API_SPECS, retries: 0 },
  { name: 'chromium', port: 4174, use: devices['Desktop Chrome'], testIgnore: API_SPECS },
  { name: 'firefox', port: 4175, use: devices['Desktop Firefox'], testIgnore: API_SPECS },
  { name: 'webkit', port: 4176, use: devices['Desktop Safari'], testIgnore: API_SPECS },
]

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'on-first-retry' },
  projects: PROJECTS.map(({ port, use, ...project }) => ({
    ...project,
    use: { ...use, baseURL: `http://localhost:${String(port)}` },
  })),
  webServer: PROJECTS.map(({ port }) => ({
    command: 'node apps/server/dist/main.js',
    url: `http://localhost:${String(port)}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      AGENDINA_WEB_DIR: 'apps/web/dist',
      AGENDINA_VERSION: 'e2e',
      AGENDINA_DATABASE_URL: 'sqlite::memory:',
    },
  })),
})
