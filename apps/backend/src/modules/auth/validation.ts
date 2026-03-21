import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
})

export const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']).optional()
})

export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
export type RegisterInput = z.infer<typeof registerSchema>
