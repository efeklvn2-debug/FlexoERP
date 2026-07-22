import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
})

export const registerSchema = z.object({
  username: z.string().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']).optional()
})

export const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER']).optional(),
  isActive: z.boolean().optional()
})

export const setRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().min(1)).min(0)
})

export const setUserPermissionOverridesSchema = z.object({
  overrides: z.array(z.object({
    permissionId: z.string().min(1),
    granted: z.boolean()
  })).min(0)
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'New password must contain at least one number'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>
export type SetUserPermissionOverridesInput = z.infer<typeof setUserPermissionOverridesSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
