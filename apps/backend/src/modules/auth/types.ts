import { Role } from '@flexoprint/types'

export interface UserEntity {
  id: string
  username: string
  passwordHash: string
  role: Role
  isActive: boolean
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  tenantId: string | null
  tenant?: {
    id: string
    name: string
    slug: string
    isActive: boolean
  } | null
}

export interface UserResponse {
  id: string
  username: string
  role: Role
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  tenantId?: string | null
  tenantName?: string
  tenantSlug?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResult {
  user: UserResponse
  tokens: AuthTokens
}
