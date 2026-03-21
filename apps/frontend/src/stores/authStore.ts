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
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          console.log('Attempting login for:', username)
          const response = await authApi.login({ username, password })
          console.log('Login response:', response)
          
          if (response.error) {
            console.error('Login error:', response.error)
            set({ error: response.error.message, isLoading: false })
            return
          }

          if (response.data) {
            const { user, tokens } = response.data
            console.log('Login success, setting tokens')
            api.setTokens(tokens.accessToken, tokens.refreshToken)
            set({ user, isAuthenticated: true, isLoading: false })
          } else {
            console.error('No data in response')
            set({ error: 'Login failed - no response', isLoading: false })
          }
        } catch (error) {
          console.error('Login exception:', error)
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
        set({ user: null, isAuthenticated: false, error: null })
      },

      checkAuth: async () => {
        console.log('Checking auth...')
        set({ isLoading: true })
        try {
          const response = await authApi.me()
          console.log('Auth check response:', response)
          
          if (response.data) {
            set({ user: response.data as User, isAuthenticated: true, isLoading: false })
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false })
          }
        } catch (err) {
          console.log('Auth check failed:', err)
          set({ user: null, isAuthenticated: false, isLoading: false })
        }
      },

      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false
        }
      }
    }
  )
)
