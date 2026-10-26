import react from '@vitejs/plugin-react'
import { defineProject } from 'vitest/config'

export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Real-browser tests run separately (vitest.browser.config.ts).
    exclude: ['**/node_modules/**', 'src/**/*.browser.test.tsx'],
  },
})
