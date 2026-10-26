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
  // Keep `node:` imports as written: some built-ins (e.g. node:sqlite) only exist with the prefix.
  removeNodeProtocol: false,
  // CommonJS dependencies (e.g. pg) call require() for Node built-ins; give the ESM bundle a real one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
})
