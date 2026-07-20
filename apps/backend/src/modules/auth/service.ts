import bcrypt from 'bcryptjs'
import { authRepository } from './repository'
import { LoginInput, RegisterInput, UpdateUserInput, SetRolePermissionsInput, SetUserPermissionOverridesInput } from './validation'
import { LoginResult, UserResponse, AuthTokens } from './types'
import { generateAccessToken, generateRefreshToken, verifyToken, extractJwtFromRefreshToken } from '../../middleware/auth'
import { Role } from '@flexoprint/types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('auth:service')

export const authService = {
  async login(input: LoginInput): Promise<LoginResult> {
    const user = await authRepository.findUserByUsername(input.username)

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
    }

    if (!user.isActive) {
      throw new AppError(401, 'ACCOUNT_INACTIVE', 'Account is inactive')
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash)

    if (!isValidPassword) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password')
    }

    await authRepository.deleteUserRefreshTokens(user.id)

    const accessToken = generateAccessToken(user.id, user.role)
    const refreshToken = generateRefreshToken(user.id, user.role)

    await authRepository.createRefreshToken({
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    logger.info({ userId: user.id, username: user.username }, 'User logged in')

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      tokens: {
        accessToken,
        refreshToken
      }
    }
  },

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyToken(extractJwtFromRefreshToken(refreshToken))

    if (!payload) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid refresh token')
    }

    const tokenData = await authRepository.findRefreshToken(refreshToken)

    if (!tokenData || tokenData.userId !== payload.userId) {
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token not found or expired')
    }

    await authRepository.deleteRefreshToken(refreshToken)

    const accessToken = generateAccessToken(payload.userId, payload.role)
    const newRefreshToken = generateRefreshToken(payload.userId, payload.role)

    await authRepository.createRefreshToken({
      token: newRefreshToken,
      userId: payload.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })

    return {
      accessToken,
      refreshToken: newRefreshToken
    }
  },

  async register(input: RegisterInput): Promise<UserResponse> {
    const existingUser = await authRepository.findUserByUsername(input.username)

    if (existingUser) {
      throw new AppError(409, 'USER_EXISTS', 'Username already taken')
    }

    const passwordHash = await bcrypt.hash(input.password, 12)

    const user = await authRepository.createUser({
      username: input.username,
      passwordHash,
      role: (input.role ?? Role.OPERATOR) as Role
    })

    logger.info({ userId: user.id, username: user.username }, 'User registered')

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  },

  async logout(refreshToken: string): Promise<void> {
    await authRepository.deleteRefreshToken(refreshToken)
    logger.info({ refreshToken: refreshToken.substring(0, 8) + '...' }, 'User logged out')
  },

  // ── Admin: User management ────────────────────────────────────

  async listUsers() {
    const users = await authRepository.listUsers()
    const overrideCounts = await Promise.all(
      users.map(u =>
        authRepository.getUserPermissionOverrides(u.id).then(ov => ov.length)
      )
    )
    return users.map((u, i) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      overrideCount: overrideCounts[i]
    }))
  },

  async getUserDetail(id: string) {
    const user = await authRepository.findUserById(id)
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    const overrides = await authRepository.getUserPermissionOverrides(id)
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      overrides: overrides.map(o => ({
        id: o.id,
        permissionId: o.permissionId,
        permissionName: o.permission.name,
        granted: o.granted
      }))
    }
  },

  async updateUser(id: string, input: UpdateUserInput) {
    const user = await authRepository.findUserById(id)
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    const updated = await authRepository.updateUser(id, input)
    return {
      id: updated.id,
      username: updated.username,
      role: updated.role,
      isActive: updated.isActive
    }
  },

  // ── Admin: Permission management ──────────────────────────────

  async listPermissions() {
    const perms = await authRepository.listPermissions()
    return perms.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      module: p.module
    }))
  },

  async listRolesWithCounts() {
    const roles: Role[] = [Role.ADMIN, Role.MANAGER, Role.OPERATOR, Role.VIEWER]
    const counts = await Promise.all(
      roles.map(async role => {
        const ids = await authRepository.getRolePermissionIds(role)
        return { role, permissionCount: ids.length }
      })
    )
    return counts
  },

  async getRolePermissions(role: Role) {
    return authRepository.getRolePermissionIds(role)
  },

  async setRolePermissions(role: Role, input: SetRolePermissionsInput) {
    const count = await authRepository.setRolePermissions(role, input.permissionIds)
    logger.info({ role, count }, 'Role permissions updated')
    return { count }
  },

  async getUserPermissionOverrides(userId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    return authRepository.getUserPermissionOverrides(userId)
  },

  async setUserPermissionOverrides(userId: string, input: SetUserPermissionOverridesInput) {
    const user = await authRepository.findUserById(userId)
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    const count = await authRepository.setUserPermissionOverrides(userId, input.overrides)
    logger.info({ userId, count }, 'User permission overrides updated')
    return { count }
  },

  async deleteUserPermissionOverride(userId: string, permissionId: string) {
    const user = await authRepository.findUserById(userId)
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found')
    await authRepository.deleteUserPermissionOverride(userId, permissionId)
  }
}
