import { api } from './client'

export interface ProductionJob {
  id: string
  jobNumber: string
  customerName?: string
  status: string
  startDate?: string
  endDate?: string
  machine: string
  wasteWeight?: number
  notes?: string
  createdAt: string
  updatedAt: string
  printedRolls?: PrintedRoll[]
  parentRollIds?: string[]
  parentRolls?: { id: string; rollNumber: string; weight: number; remainingWeight: number }[]
}

export interface PrintedRoll {
  id: string
  productionJobId: string
  rollId: string
  weightUsed: number
  wasteWeight?: number
  status?: string
  customerId?: string
  pickedUpAt?: string
  createdAt: string
  roll?: {
    id: string
    rollNumber: string
    weight: number
    material?: {
      id: string
      code: string
      name: string
      subCategory: string
    }
  }
  customer?: {
    id: string
    name: string
  }
}

export interface PrintedRollDisplay {
  id: string
  rollNumber: string
  weight: number
  material: string
  customerName: string
  jobNumber: string
  status: string
  isCombination?: boolean
  parentRolls?: string[]
  pickedUpAt?: string
  createdAt: string
}

export interface ParentRoll {
  id: string
  rollNumber: string
  weight: number | string
  remainingWeight: number | string
  status: string
  material: {
    id: string
    code: string
    name: string
    subCategory: string
  }
}

export interface CreateJobInput {
  customerName?: string
  machine: string
  category: string
  rollIds: string[]
  printedRollWeights: number[]
  wasteWeight?: number
  notes?: string
}

export const productionApi = {
  getJobs: async (status?: string) => {
    const query = status ? `?status=${status}` : ''
    return api.get<ProductionJob[]>(`/production${query}`)
  },

  getJob: async (id: string) => {
    return api.get<ProductionJob>(`/production/${id}`)
  },

  getAvailableRolls: async (category?: string) => {
    const query = category ? `?category=${category}` : ''
    return api.get<ParentRoll[]>(`/production/rolls${query}`)
  },

  getPrintedRolls: async (filters?: { status?: string }) => {
    const params = new URLSearchParams()
    if (filters?.status) params.append('status', filters.status)
    const query = params.toString() ? `?${params.toString()}` : ''
    return api.get<PrintedRollDisplay[]>(`/production/printed-rolls${query}`)
  },

  getRollTypes: async () => {
    return api.get<any[]>('/production/roll-types')
  },

  createJob: async (data: CreateJobInput) => {
    return api.post<ProductionJob>('/production', data)
  },

  updateJob: async (id: string, data: Partial<CreateJobInput>) => {
    return api.put<ProductionJob>(`/production/${id}`, data)
  },

  completeJob: async (id: string) => {
    return api.post<ProductionJob>(`/production/${id}/complete`, {})
  },

  deleteJob: async (id: string) => {
    return api.delete<void>(`/production/${id}`)
  }
}
