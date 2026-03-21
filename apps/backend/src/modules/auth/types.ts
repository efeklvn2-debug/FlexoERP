import { Role } from '@flexoprint/types'

export interface UserEntity {
  id: string
  username: string
  passwordHash: string
  role: Role
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserResponse {
  id: string
  username: string
  role: Role
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResult {
  user: UserResponse
  tokens: AuthTokens
}
