import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('uses defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      host: '0.0.0.0',
      port: 3000,
      version: '0.0.0-dev',
      databaseUrl: 'sqlite:./data/agendina.db',
    })
  })

  it('reads values from the environment', () => {
    expect(
      loadConfig({
        HOST: '127.0.0.1',
        PORT: '8080',
        AGENDINA_VERSION: '1.0.0',
        AGENDINA_WEB_DIR: '/app/web',
        AGENDINA_DATABASE_URL: 'postgres://db/agendina',
      }),
    ).toEqual({
      host: '127.0.0.1',
      port: 8080,
      version: '1.0.0',
      webDir: '/app/web',
      databaseUrl: 'postgres://db/agendina',
    })
  })

  it.each(['abc', '0', '70000', '80.5'])('rejects invalid PORT %s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/)
  })
})
