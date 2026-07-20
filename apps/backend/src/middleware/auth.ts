import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { Role, Permission } from '@flexoprint/types'
import { AppError } from './errorHandler'
import { prisma } from '../database'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Set it before starting the server.')
}
const JWT_SECRET = process.env.JWT_SECRET

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
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string }
    req.user = { id: payload.userId, username: '', role: payload.role as Role }
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

export async function checkUserPermission(userId: string, role: Role, permissionName: string): Promise<boolean> {
  const permission = await prisma.permission.findUnique({ where: { name: permissionName } })
  if (!permission) return false

  const rolePerm = await prisma.rolePermission.findUnique({
    where: { role_permissionId: { role, permissionId: permission.id } }
  })

  const userPerm = await prisma.userPermission.findUnique({
    where: { userId_permissionId: { userId, permissionId: permission.id } }
  })

  if (userPerm) return userPerm.granted

  return !!rolePerm
}

export async function getUserEffectivePermissions(userId: string, role: Role): Promise<string[]> {
  const dbPerms = await prisma.permission.findMany({
    include: {
      rolePermissions: { where: { role } },
      userPermissions: { where: { userId } }
    }
  })

  return dbPerms
    .filter(p => {
      const roleMatch = p.rolePermissions.length > 0
      const userOverride = p.userPermissions.find(u => u.userId === userId)
      if (userOverride) return userOverride.granted
      return roleMatch
    })
    .map(p => p.name)
}

export function requirePermission(permissionName: Permission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    try {
      const has = await checkUserPermission(req.user.id, req.user.role, permissionName)
      if (!has) {
        throw new AppError(403, 'FORBIDDEN', `Permission denied: ${permissionName}`)
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}

export function generateAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '15m' })
}

export function generateRefreshToken(userId: string, role: string): string {
  const token = jwt.sign({ userId, role, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' })
  return token + ':' + crypto.randomUUID()
}

export function extractJwtFromRefreshToken(token: string): string {
  const idx = token.indexOf(':')
  return idx === -1 ? token : token.slice(0, idx)
}

export function verifyToken(token: string): { userId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string }
  } catch {
    return null
  }
}
