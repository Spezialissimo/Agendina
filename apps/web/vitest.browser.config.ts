import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/** Component tests that need a real browser (the CodeMirror editor): `pnpm test:browser`. */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  test: {
    name: 'web-browser',
    include: ['src/**/*.browser.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
