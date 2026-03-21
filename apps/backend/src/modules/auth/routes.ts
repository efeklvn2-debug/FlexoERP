import { Router } from 'express'
import { authController } from './controller'
import { validateRequest } from '../../middleware/validation'
import { loginSchema, refreshTokenSchema, registerSchema } from './validation'
import { authenticate, loadUser, authorize } from '../../middleware/auth'
import { Role } from '@flexoprint/types'

export const authRouter = Router()

authRouter.post(
  '/login',
  validateRequest(loginSchema),
  authController.login
)

authRouter.post(
  '/refresh',
  validateRequest(refreshTokenSchema),
  authController.refreshToken
)

authRouter.post(
  '/register',
  validateRequest(registerSchema),
  authenticate,
  loadUser,
  authorize(Role.ADMIN),
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
