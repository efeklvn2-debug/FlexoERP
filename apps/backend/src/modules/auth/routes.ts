import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { authController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { authLimiter, registerLimiter } from '../../middleware/rateLimiters'
import { loginSchema, refreshTokenSchema, registerSchema, updateUserSchema, setRolePermissionsSchema, setUserPermissionOverridesSchema } from './validation'
import { authenticate, loadUser, requirePermission } from '../../middleware/auth'

export const authRouter = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' } }
})

authRouter.post(
  '/login',
  loginLimiter,
  validateRequest(loginSchema),
  authController.login
)

authRouter.post(
  '/refresh',
  authLimiter,
  validateRequest(refreshTokenSchema),
  authController.refreshToken
)

authRouter.post(
  '/register',
  registerLimiter,
  validateRequest(registerSchema),
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.register
)

authRouter.post(
  '/logout',
  authenticate,
  loadUser,
  authController.logout
)

authRouter.get(
  '/me',
  authenticate,
  loadUser,
  authController.me
)

authRouter.get(
  '/permissions',
  authenticate,
  loadUser,
  authController.myPermissions
)

// ── Admin: User & Permission Management ─────────────────────────

authRouter.get(
  '/users',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.listUsers
)

authRouter.get(
  '/users/:id',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.getUserDetail
)

authRouter.patch(
  '/users/:id',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  validateRequest(updateUserSchema),
  authController.updateUser
)

authRouter.get(
  '/permissions/all',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.listAllPermissions
)

authRouter.get(
  '/roles',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.listRoles
)

authRouter.get(
  '/roles/:role/permissions',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.getRolePermissions
)

authRouter.put(
  '/roles/:role/permissions',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  validateRequest(setRolePermissionsSchema),
  authController.setRolePermissions
)

authRouter.get(
  '/users/:id/permissions',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.getUserPermissionOverrides
)

authRouter.put(
  '/users/:id/permissions',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  validateRequest(setUserPermissionOverridesSchema),
  authController.setUserPermissionOverrides
)

authRouter.delete(
  '/users/:id/permissions/:permId',
  authenticate,
  loadUser,
  requirePermission('auth:manage_users'),
  authController.deleteUserPermissionOverride
)
