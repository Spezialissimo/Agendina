import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
  // Bundle everything (including TypeScript-source workspace packages) into one file,
  // so the runtime image needs no node_modules.
  noExternal: [/.*/],
})
