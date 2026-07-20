import { Request, Response, NextFunction } from 'express'
import { authService } from './service'
import { LoginInput, RefreshTokenInput } from './validation'
import { AuthenticatedRequest, getUserEffectivePermissions } from '../../middleware/auth'
import { sendError } from '../../middleware/errorHandler'
import { Role } from '@flexoprint/types'

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as LoginInput
      const result = await authService.login(input)
      res.status(200).json({ data: result })
    } catch (error) {
      sendError(res, error, 'auth.login')
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as RefreshTokenInput
      const tokens = await authService.refreshToken(input.refreshToken)
      res.status(200).json({ data: tokens })
    } catch (error) {
      sendError(res, error, 'auth.refreshToken')
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body
      const user = await authService.register(input)
      res.status(201).json({ data: user })
    } catch (error) {
      sendError(res, error, 'auth.register')
    }
  },

  async logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.body.refreshToken as string
      await authService.logout(refreshToken)
      res.status(204).send()
    } catch (error) {
      sendError(res, error, 'auth.logout')
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
      sendError(res, error, 'auth.me')
    }
  },

  async myPermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
        return
      }
      const permissions = await getUserEffectivePermissions(req.user.id, req.user.role)
      res.status(200).json({ data: permissions })
    } catch (error) {
      sendError(res, error, 'auth.myPermissions')
    }
  },

  // ── Admin: User management ────────────────────────────────────

  async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const users = await authService.listUsers()
      res.json({ data: users })
    } catch (error) {
      sendError(res, error, 'auth.listUsers')
    }
  },

  async getUserDetail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const detail = await authService.getUserDetail(req.params.id)
      res.json({ data: detail })
    } catch (error) {
      sendError(res, error, 'auth.getUserDetail')
    }
  },

  async updateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.updateUser(req.params.id, req.body)
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'auth.updateUser')
    }
  },

  // ── Admin: Permission management ──────────────────────────────

  async listAllPermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const perms = await authService.listPermissions()
      res.json({ data: perms })
    } catch (error) {
      sendError(res, error, 'auth.listAllPermissions')
    }
  },

  async listRoles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const roles = await authService.listRolesWithCounts()
      res.json({ data: roles })
    } catch (error) {
      sendError(res, error, 'auth.listRoles')
    }
  },

  async getRolePermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const permIds = await authService.getRolePermissions(req.params.role as Role)
      res.json({ data: permIds })
    } catch (error) {
      sendError(res, error, 'auth.getRolePermissions')
    }
  },

  async setRolePermissions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.setRolePermissions(req.params.role as Role, req.body)
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'auth.setRolePermissions')
    }
  },

  async getUserPermissionOverrides(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const overrides = await authService.getUserPermissionOverrides(req.params.id)
      res.json({ data: overrides })
    } catch (error) {
      sendError(res, error, 'auth.getUserPermissionOverrides')
    }
  },

  async setUserPermissionOverrides(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await authService.setUserPermissionOverrides(req.params.id, req.body)
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'auth.setUserPermissionOverrides')
    }
  },

  async deleteUserPermissionOverride(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await authService.deleteUserPermissionOverride(req.params.id, req.params.permId)
      res.status(204).send()
    } catch (error) {
      sendError(res, error, 'auth.deleteUserPermissionOverride')
    }
  }
}
