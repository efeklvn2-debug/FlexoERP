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

export interface UserListItem {
  id: string
  username: string
  role: string
  isActive: boolean
  createdAt: string
  overrideCount: number
}

export interface PermissionInfo {
  id: string
  name: string
  description: string | null
  module: string | null
}

export interface UserOverride {
  id: string
  permissionId: string
  permissionName: string
  granted: boolean
}

export interface RoleInfo {
  role: string
  permissionCount: number
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
  },

  myPermissions: async () => {
    return api.get<string[]>('/auth/permissions')
  },

  // ── Admin API ─────────────────────────────────────────────────

  getUsers: async () => {
    return api.get<UserListItem[]>('/auth/users')
  },

  getUserDetail: async (id: string) => {
    return api.get<{ id: string; username: string; role: string; isActive: boolean; overrides: UserOverride[] }>(`/auth/users/${id}`)
  },

  updateUser: async (id: string, data: { role?: string; isActive?: boolean }) => {
    return api.patch(`/auth/users/${id}`, data)
  },

  getAllPermissions: async () => {
    return api.get<PermissionInfo[]>('/auth/permissions/all')
  },

  getRoles: async () => {
    return api.get<RoleInfo[]>('/auth/roles')
  },

  getRolePermissions: async (role: string) => {
    return api.get<string[]>(`/auth/roles/${role}/permissions`)
  },

  setRolePermissions: async (role: string, permissionIds: string[]) => {
    return api.put(`/auth/roles/${role}/permissions`, { permissionIds })
  },

  getUserPermissionOverrides: async (userId: string) => {
    return api.get<UserOverride[]>(`/auth/users/${userId}/permissions`)
  },

  setUserPermissionOverrides: async (userId: string, overrides: { permissionId: string; granted: boolean }[]) => {
    return api.put(`/auth/users/${userId}/permissions`, { overrides })
  },

  deleteUserPermissionOverride: async (userId: string, permissionId: string) => {
    return api.delete(`/auth/users/${userId}/permissions/${permissionId}`)
  }
}
