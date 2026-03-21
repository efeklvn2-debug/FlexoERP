import { Prisma } from '@prisma/client'
import { prisma } from '../../database'
import { UserEntity } from './types'
import { Role } from '@flexoprint/types'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('auth:repository')

export const authRepository = {
  async findUserByUsername(username: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { username }
    })
    return user as UserEntity | null
  },

  async findUserById(id: string): Promise<UserEntity | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    })
    return user as UserEntity | null
  },

  async createUser(data: {
    username: string
    passwordHash: string
    role?: Role
  }): Promise<UserEntity> {
    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role || Role.OPERATOR
      }
    })
    logger.info({ userId: user.id }, 'User created')
    return user as UserEntity
  },

  async updateUser(id: string, data: Partial<Prisma.UserUpdateInput>): Promise<UserEntity> {
    const user = await prisma.user.update({
      where: { id },
      data
    })
    return user as UserEntity
  },

  async deleteUser(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id }
    })
    logger.info({ userId: id }, 'User deleted')
  },

  async createRefreshToken(data: {
    token: string
    userId: string
    expiresAt: Date
  }): Promise<void> {
    await prisma.refreshToken.create({ data })
    logger.info({ userId: data.userId }, 'Refresh token created')
  },

  async findRefreshToken(token: string): Promise<{ userId: string } | null> {
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!refreshToken || refreshToken.expiresAt < new Date() || !refreshToken.user.isActive) {
      return null
    }

    return { userId: refreshToken.userId }
  },

  async deleteRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token }
    })
  },

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId }
    })
  }
}
