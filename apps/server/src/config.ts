export interface Config {
  host: string
  port: number
  version: string
  webDir?: string
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const config: Config = {
    host: env.HOST ?? '0.0.0.0',
    port: parsePort(env.PORT ?? '3000'),
    version: env.AGENDINA_VERSION ?? '0.0.0-dev',
  }
  if (env.AGENDINA_WEB_DIR !== undefined) config.webDir = env.AGENDINA_WEB_DIR
  return config
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}": expected an integer between 1 and 65535`)
  }
  return port
}
