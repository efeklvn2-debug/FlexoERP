import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../api/auth'
import { api } from '../api/client'

interface User {
  id: string
  username: string
  role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'
  isActive: boolean
}

interface AuthState {
  user: User | null
  permissions: string[]
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setUserAndPermissions: (user: User, permissions: string[], tokens: { accessToken: string; refreshToken: string }) => void
  clearError: () => void
}

export function hasPermission(perm: string): boolean {
  const state = useAuthStore.getState()
  return state.permissions.includes(perm)
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login({ username, password })

          if (response.error) {
            set({ error: response.error.message, isLoading: false })
            return
          }

          if (response.data) {
            const { user, tokens } = (response.data as any).data
            api.setTokens(tokens.accessToken, tokens.refreshToken)
            const permRes = await authApi.myPermissions()
            set({
              user,
              permissions: (permRes.data as any)?.data ?? [],
              isAuthenticated: true,
              isLoading: false
            })
          } else {
            set({ error: 'Login failed - no response', isLoading: false })
          }
        } catch (error) {
          set({ error: 'Login failed', isLoading: false })
        }
      },

      logout: async () => {
        const refreshToken = api.getRefreshToken()
        if (refreshToken) {
          try {
            await authApi.logout(refreshToken)
          } catch {
            // Ignore logout errors
          }
        }
        api.clearTokens()
        set({ user: null, permissions: [], isAuthenticated: false, error: null })
      },

      checkAuth: async () => {
        set({ isLoading: true })
        try {
          const response = await authApi.me()

          if (response.data) {
            const userData = (response.data as any).data
            const permRes = await authApi.myPermissions()
            set({
              user: userData,
              permissions: (permRes.data as any)?.data ?? [],
              isAuthenticated: true,
              isLoading: false
            })
          } else {
            set({ user: null, permissions: [], isAuthenticated: false, isLoading: false })
          }
        } catch (err) {
          set({ user: null, permissions: [], isAuthenticated: false, isLoading: false })
        }
      },

      setUserAndPermissions: (user: User, permissions: string[], tokens: { accessToken: string; refreshToken: string }) => {
        api.setTokens(tokens.accessToken, tokens.refreshToken)
        set({ user, permissions, isAuthenticated: true, isLoading: false })
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, permissions: state.permissions, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false
        }
      }
    }
  )
)
