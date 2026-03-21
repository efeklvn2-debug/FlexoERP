import { api } from './client'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: {
    id: string
    username: string
    role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'
    isActive: boolean
    createdAt: string
    updatedAt: string
  }
  tokens: {
    accessToken: string
    refreshToken: string
  }
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

export const authApi = {
  login: async (data: LoginRequest) => {
    return api.post<LoginResponse>('/auth/login', data)
  },

  refreshToken: async (refreshToken: string) => {
    return api.post<RefreshTokenResponse>('/auth/refresh', { refreshToken })
  },

  logout: async (refreshToken: string) => {
    return api.post('/auth/logout', { refreshToken })
  },

  me: async () => {
    return api.get<{ id: string; username: string; role: string }>('/auth/me')
  }
}
