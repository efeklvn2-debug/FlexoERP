import { Request, Response, NextFunction } from 'express'
import { authService } from './service'
import { LoginInput, RefreshTokenInput } from './validation'
import { AuthenticatedRequest } from '../../middleware/auth'

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as LoginInput
      const result = await authService.login(input)
      res.status(200).json({ data: result })
    } catch (error) {
      next(error)
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as RefreshTokenInput
      const tokens = await authService.refreshToken(input.refreshToken)
      res.status(200).json({ data: tokens })
    } catch (error) {
      next(error)
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const user = await authService.register(input)
      res.status(201).json({ data: user })
    } catch (error) {
      next(error)
    }
  },

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.body.refreshToken as string
      await authService.logout(refreshToken)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },

  async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
        return
      }
      res.status(200).json({ data: req.user })
    } catch (error) {
      next(error)
    }
  }
}
