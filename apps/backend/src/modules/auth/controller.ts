import { Request, Response, NextFunction } from 'express'
import { authService } from './service'
import { LoginInput, RefreshTokenInput } from './validation'
import { AuthenticatedRequest, getUserEffectivePermissions } from '../../middleware/auth'
import { sendError } from '../../middleware/errorHandler'
import { Role } from '@flexoprint/types'
import { auditService } from '../audit'

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = req.body as LoginInput
      const result = await authService.login(input)
      auditService.record({
        userId: result.user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: result.user.id,
        description: `User ${result.user.username} logged in`,
        ipAddress: req.ip
      })
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
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id
      if (!tenantId) {
        res.status(400).json({ error: { code: 'TENANT_REQUIRED', message: 'Tenant context required' } })
        return
      }
      const user = await authService.register(input, tenantId)
      auditService.record({
        userId: (req as any).user?.id,
        action: 'auth.register',
        entityType: 'User',
        entityId: user.id,
        description: `Created user ${user.username} with role ${user.role}`,
        ipAddress: req.ip
      })
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
      auditService.record({
        userId: req.user?.id,
        action: 'auth.update_user',
        entityType: 'User',
        entityId: req.params.id,
        description: `Updated user ${req.params.id}: ${JSON.stringify(req.body)}`,
        ipAddress: req.ip
      })
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
      auditService.record({
        userId: req.user?.id,
        action: 'auth.set_role_permissions',
        entityType: 'Role',
        entityId: req.params.role,
        description: `Updated permissions for role ${req.params.role} (${req.body.permissionIds?.length ?? 0} perms)`,
        ipAddress: req.ip
      })
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
      auditService.record({
        userId: req.user?.id,
        action: 'auth.set_user_overrides',
        entityType: 'User',
        entityId: req.params.id,
        description: `Updated permission overrides for user ${req.params.id} (${req.body.overrides?.length ?? 0} overrides)`,
        ipAddress: req.ip
      })
      res.json({ data: result })
    } catch (error) {
      sendError(res, error, 'auth.setUserPermissionOverrides')
    }
  },

  async deleteUserPermissionOverride(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await authService.deleteUserPermissionOverride(req.params.id, req.params.permId)
      auditService.record({
        userId: req.user?.id,
        action: 'auth.delete_user_override',
        entityType: 'User',
        entityId: req.params.id,
        description: `Removed permission override ${req.params.permId} from user ${req.params.id}`,
        ipAddress: req.ip
      })
      res.status(204).send()
    } catch (error) {
      sendError(res, error, 'auth.deleteUserPermissionOverride')
    }
  },

  async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      await authService.changePassword(req.user!.id, req.body)
      auditService.record({
        userId: req.user!.id,
        action: 'auth.change_password',
        entityType: 'User',
        entityId: req.user!.id,
        description: 'User changed their password',
        ipAddress: req.ip
      })
      res.json({ data: { message: 'Password changed successfully' } })
    } catch (error) {
      sendError(res, error, 'auth.changePassword')
    }
  }
}
