import { api } from './client'

export type RollStatus = 'AVAILABLE' | 'IN_PRODUCTION' | 'CONSUMED' | 'RETURNED'
export type POStatus = 'PENDING' | 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'CANCELLED'

export interface POLineItem {
  id: string
  purchaseOrderId: string
  materialId: string
  material?: { id: string; code: string; name: string }
  quantity: number
  totalWeight: number
  unitPrice: number
  receivedQty: number
  rollWeights?: number[]
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  supplier: string
  status: POStatus
  expectedDate?: string
  receivedDate?: string
  notes?: string
  totalAmount?: number
  rolls?: Roll[]
  items?: POLineItem[]
}

export interface Roll {
  id: string
  rollNumber: string
  materialId: string
  material?: { id: string; code: string; name: string; subCategory?: string }
  purchaseOrderId?: string
  weight: number
  remainingWeight: number
  width?: number
  length?: number
  coreSize?: string
  status: RollStatus
  receivedDate?: string
  createdAt?: string
}

export interface ProductionJob {
  id: string
  jobNumber: string
  orderId?: string
  order?: { id: string; orderNumber: string }
  status: string
  startDate?: string
  endDate?: string
  machine?: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

export interface CreatePOLineItem {
  materialId: string
  quantity: number
  totalWeight: number
  unitPrice: number
  rollWeights?: number[]
}

export const procurementApi = {
  // Purchase Orders
  getPOs: async (status?: string) => {
    const query = status ? `?status=${status}` : ''
    return api.get<PurchaseOrder[]>(`/procurement/purchase-orders${query}`)
  },
  getPO: async (id: string) => api.get<PurchaseOrder>(`/procurement/purchase-orders/${id}`),
  createPO: async (data: { 
    supplier: string; 
    expectedDate?: string; 
    notes?: string;
    items: CreatePOLineItem[];
  }) => api.post<PurchaseOrder>('/procurement/purchase-orders', data),
  
  updatePO: async (id: string, data: { supplier?: string; expectedDate?: string; notes?: string }) => 
    api.patch<PurchaseOrder>(`/procurement/purchase-orders/${id}`, data),
  
  addLineItem: async (poId: string, data: { materialId: string; quantity: number; totalWeight: number; unitPrice: number; rollWeights?: number[] }) =>
    api.post<PurchaseOrder>(`/procurement/purchase-orders/${poId}/items`, data),
  
  removeLineItem: async (poId: string, lineItemId: string) => 
    api.delete(`/procurement/purchase-orders/${poId}/items/${lineItemId}`),
  
  deletePO: async (id: string) => api.delete(`/procurement/purchase-orders/${id}`),
  
  receivePO: async (poId: string) => api.post<{ po: PurchaseOrder; rolls: Roll[] }>(`/procurement/purchase-orders/${poId}/receive`, {}),

  // Rolls
  getRolls: async (materialId?: string, status?: string) => {
    const params = new URLSearchParams()
    if (materialId) params.append('materialId', materialId)
    if (status) params.append('status', status)
    const query = params.toString() ? `?${params.toString()}` : ''
    return api.get<Roll[]>(`/procurement/rolls${query}`)
  },
  createRoll: async (data: any) => api.post<Roll>('/procurement/rolls', data),
  createBulkRolls: async (data: { materialId: string; count: number; weights: number[]; purchaseOrderId?: string }) => 
    api.post<Roll[]>('/procurement/rolls/bulk', data),

  // Production Jobs
  getJobs: async (status?: string) => {
    const query = status ? `?status=${status}` : ''
    return api.get<ProductionJob[]>(`/procurement/jobs${query}`)
  },
  getJob: async (id: string) => api.get<ProductionJob>(`/procurement/jobs/${id}`),
  createJob: async (data: { orderId?: string; machine?: string; notes?: string }) => 
    api.post<ProductionJob>('/procurement/jobs', data),
  assignRolls: async (jobId: string, rolls: { rollId: string; weightUsed: number }[]) => 
    api.post('/procurement/jobs/assign-rolls', { jobId, rolls }),
  completeJob: async (id: string) => api.post<ProductionJob>(`/procurement/jobs/${id}/complete`, {})
}
