import bcrypt from 'bcryptjs'
import { authRepository } from './repository'
import { LoginInput, RegisterInput } from './validation'
import { LoginResult, UserResponse, AuthTokens } from './types'
import { generateAccessToken, generateRefreshToken, verifyToken } from '../../middleware/auth'
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

    const accessToken = generateAccessToken(user.id)
    const refreshToken = generateRefreshToken(user.id)

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
    const payload = verifyToken(refreshToken)

    if (!payload) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid refresh token')
    }

    const tokenData = await authRepository.findRefreshToken(refreshToken)

    if (!tokenData || tokenData.userId !== payload.userId) {
      throw new AppError(401, 'INVALID_TOKEN', 'Refresh token not found or expired')
    }

    await authRepository.deleteRefreshToken(refreshToken)

    const accessToken = generateAccessToken(payload.userId)
    const newRefreshToken = generateRefreshToken(payload.userId)

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
      role: input.role || Role.OPERATOR
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
  }
}
