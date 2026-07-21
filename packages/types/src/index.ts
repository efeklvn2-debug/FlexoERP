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

// DB-backed — seeded in prisma/seed.ts
// This type is a compile-time reference; runtime source of truth is the database.
export type Permission =
  | 'auth:read'
  | 'auth:manage_users'
  | 'sales_order:read'
  | 'sales_order:create'
  | 'sales_order:edit'
  | 'sales_order:approve'
  | 'sales_order:delete'
  | 'sales_order:pickup'
  | 'sales_order:payment'
  | 'sales_order:adjust_deposit'
  | 'production:read'
  | 'production:create'
  | 'production:complete'
  | 'production:edit'
  | 'production:delete'
  | 'inventory:read'
  | 'inventory:create'
  | 'inventory:edit'
  | 'inventory:adjust'
  | 'inventory:dispose'
  | 'procurement:read'
  | 'procurement:create'
  | 'procurement:receive'
  | 'procurement:edit'
  | 'finance:read'
  | 'finance:write'
  | 'finance:manage_accounts'
  | 'settings:read'
  | 'settings:write'
  | 'settings:manage_materials'
  | 'settings:manage_colors'
  | 'customer:read'
  | 'customer:create'
  | 'customer:edit'
  | 'customer:payment'
  | 'supplier:read'
  | 'supplier:create'
  | 'supplier:edit'
  | 'report:read'
  | 'audit:read'
  | 'pricing:read'
  | 'pricing:write'

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
