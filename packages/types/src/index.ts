export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER'
}

export interface User {
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

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  user: Omit<User, 'passwordHash'>
  tokens: AuthTokens
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface ApiError {
  code: string
  message: string
  details?: unknown
}

export interface ApiResponse<T> {
  data?: T
  error?: ApiError
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  uptime: number
  database: 'connected' | 'disconnected'
}

export type Permission =
  | 'auth:read'
  | 'auth:write'
  | 'sales:read'
  | 'sales:write'
  | 'production:read'
  | 'production:write'
  | 'inventory:read'
  | 'inventory:write'
  | 'accounting:read'
  | 'accounting:write'
  | 'reporting:read'

export const RolePermissions: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    'auth:read', 'auth:write',
    'sales:read', 'sales:write',
    'production:read', 'production:write',
    'inventory:read', 'inventory:write',
    'accounting:read', 'accounting:write',
    'reporting:read'
  ],
  [Role.MANAGER]: [
    'sales:read', 'sales:write',
    'production:read', 'production:write',
    'inventory:read', 'inventory:write',
    'accounting:read',
    'reporting:read'
  ],
  [Role.OPERATOR]: [
    'sales:read', 'sales:write',
    'production:read', 'production:write',
    'inventory:read', 'inventory:write'
  ],
  [Role.VIEWER]: [
    'reporting:read'
  ]
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface Customer {
  id: string
  name: string
  code: string
  email?: string
  phone?: string
  address?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface OrderItem {
  id: string
  orderId: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  customer?: Customer
  status: OrderStatus
  totalAmount: number
  notes?: string
  dueDate?: Date
  createdAt: Date
  updatedAt: Date
  createdById?: string
  items: OrderItem[]
}
