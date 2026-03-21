import { api } from './client'

export interface PrintedRollDetail {
  id: string
  rollNumber: string
  materialName: string
  weightUsed: number
  jobNumber: string
  createdAt: string
}

export interface Transaction {
  id: string
  customerId: string
  customer?: { id: string; name: string }
  date: string
  type: 'PICKUP' | 'PAYMENT' | 'CORE_DEPOSIT'
  amount?: number
  notes?: string
  printedRollIds: string[]
  printedRollDetails?: PrintedRollDetail[]
  packingBags?: number
  amountPaid?: number
  createdAt: string
}

export interface TransactionInput {
  customerId: string
  type: 'PICKUP' | 'PAYMENT' | 'CORE_DEPOSIT'
  amount?: number
  notes?: string
  printedRollIds?: string[]
  date?: string
  packingBags?: number
  amountPaid?: number
}

export const transactionApi = {
  getTransactions: async (filters?: { customerId?: string; type?: string; dateFrom?: string; dateTo?: string }) => {
    const params = new URLSearchParams()
    if (filters?.customerId) params.append('customerId', filters.customerId)
    if (filters?.type) params.append('type', filters.type)
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom)
    if (filters?.dateTo) params.append('dateTo', filters.dateTo)
    const query = params.toString() ? `?${params.toString()}` : ''
    return api.get<Transaction[]>(`/transactions${query}`)
  },

  getTransaction: async (id: string) => {
    return api.get<Transaction>(`/transactions/${id}`)
  },

  createTransaction: async (data: TransactionInput) => {
    return api.post<Transaction>('/transactions', data)
  },

  deleteTransaction: async (id: string) => {
    return api.delete<void>(`/transactions/${id}`)
  },

  getAvailableRolls: async (customerId: string) => {
    return api.get<any[]>(`/transactions/available-rolls?customerId=${customerId}`)
  }
}
