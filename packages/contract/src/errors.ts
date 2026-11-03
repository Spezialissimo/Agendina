import { z } from 'zod'

/** Every non-2xx API response has this shape. `error` is a stable, machine-readable code. */
export const ApiErrorBody = z.object({ error: z.string() })
export type ApiErrorBody = z.infer<typeof ApiErrorBody>
