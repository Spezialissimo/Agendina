import { HealthResponse } from '@agendina/contract'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
  }
}

export async function getHealth(fetchFn: FetchFn = fetch): Promise<HealthResponse> {
  const res = await fetchFn('/api/health')
  if (!res.ok) throw new ApiError(res.status)
  return HealthResponse.parse(await res.json())
}
