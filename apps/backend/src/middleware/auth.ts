import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { Role, RolePermissions } from '@flexoprint/types'
import { AppError } from './errorHandler'
import { prisma } from '../database'

const JWT_SECRET = process.env.JWT_SECRET || 'flexoprint-secret-change-in-production'

export interface AuthUser {
  id: string
  username: string
  role: Role
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'No token provided')
  }

  const token = authHeader.substring(7)

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string }
    req.user = { id: payload.userId, username: '', role: Role.OPERATOR } as AuthUser
    next()
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token')
  }
}

export async function loadUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    next()
    return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true
      }
    })

    if (!user || !user.isActive) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not found or inactive')
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role as Role
    }
    next()
  } catch (err) {
    next(err)
  }
}

export function authorize(...allowedRoles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions')
    }

    next()
  }
}

export function requirePermission(permission: keyof typeof RolePermissions) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    const permissions = RolePermissions[req.user.role]
    if (!permissions.includes(permission)) {
      throw new AppError(403, 'FORBIDDEN', `Permission denied: ${permission}`)
    }

    next()
  }
}

export function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' })
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string }
  } catch {
    return null
  }
}
