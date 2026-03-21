import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = '/api'

export interface ApiResponse<T> {
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

function getAccessToken() {
  return localStorage.getItem('accessToken')
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken')
}

function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = getRefreshToken()
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken
          })

          const { accessToken, refreshToken: newRefreshToken } = response.data.data
          setTokens(accessToken, newRefreshToken)

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`
          }
          return client(originalRequest)
        } catch {
          clearTokens()
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  }
)

export const api = {
  async get<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await client.get<T>(url)
      return { data: response.data }
    } catch (error) {
      return handleError(error)
    }
  },

  async post<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await client.post<T>(url, data)
      return { data: response.data }
    } catch (error) {
      return handleError(error)
    }
  },

  async put<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await client.put<T>(url, data)
      return { data: response.data }
    } catch (error) {
      return handleError(error)
    }
  },

  async patch<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await client.patch<T>(url, data)
      return { data: response.data }
    } catch (error) {
      return handleError(error)
    }
  },

  async delete<T>(url: string): Promise<ApiResponse<T>> {
    try {
      const response = await client.delete<T>(url)
      return { data: response.data ?? null as T }
    } catch (error) {
      return handleError(error)
    }
  },

  setTokens,
  getRefreshToken,
  clearTokens
}

function handleError(error: unknown): ApiResponse<never> {
  if (axios.isAxiosError(error)) {
    const response = error.response?.data as ApiResponse<never>
    return {
      error: response?.error || {
        code: 'NETWORK_ERROR',
        message: error.message
      }
    }
  }
  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred'
    }
  }
}
