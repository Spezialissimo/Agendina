import { z } from 'zod'

export const Email = z.string().trim().toLowerCase().pipe(z.email().max(254))

export const Password = z.string().min(10).max(256)

export const Credentials = z.object({ email: Email, password: Password })
export type Credentials = z.infer<typeof Credentials>

export const User = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'member']),
})
export type User = z.infer<typeof User>

export const UserResponse = z.object({ user: User })
export type UserResponse = z.infer<typeof UserResponse>

export const AuthState = z.object({
  /** True until the first account (the admin) exists. */
  setupRequired: z.boolean(),
  signupOpen: z.boolean(),
  user: User.nullable(),
})
export type AuthState = z.infer<typeof AuthState>

export const InstanceSettings = z.object({ signupOpen: z.boolean() })
export type InstanceSettings = z.infer<typeof InstanceSettings>
