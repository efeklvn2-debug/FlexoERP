import { api } from './client'

export type MaterialCategory = 
  | 'PLAIN_ROLLS' 
  | 'INK_SOLVENTS' 
  | 'PACKAGING'

export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER'

export interface Material {
  id: string
  code: string
  name: string
  category: MaterialCategory
  subCategory?: string
  unitOfMeasure: string
  minStock: number
  costPrice?: number
  packSize?: number
  drumSize?: number
  coreWeight?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MaterialWithStock extends Material {
  totalStock: number
  locations: { location: string; quantity: number }[]
}

export interface StockMovement {
  id: string
  materialId: string
  material?: Material
  stockId?: string
  type: MovementType
  quantity: number
  reference?: string
  notes?: string
  createdAt: string
  createdById?: string
}

export const inventoryApi = {
  getMaterials: async () => {
    return api.get<MaterialWithStock[]>('/inventory/materials')
  },

  getMaterial: async (id: string) => {
    return api.get<Material>(`/inventory/materials/${id}`)
  },

  createMaterial: async (data: Omit<Material, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) => {
    return api.post<Material>('/inventory/materials', data)
  },

  updateMaterial: async (id: string, data: Partial<Material>) => {
    return api.patch<Material>(`/inventory/materials/${id}`, data)
  },

  deleteMaterial: async (id: string) => {
    return api.delete(`/inventory/materials/${id}`)
  },

  recordMovement: async (data: {
    materialId: string
    type: MovementType
    quantity: number
    reference?: string
    notes?: string
  }) => {
    return api.post<StockMovement>('/inventory/movements', data)
  },

  archiveMaterial: async (id: string) => {
    return api.patch<Material>(`/inventory/materials/${id}/archive`, {})
  },

  restoreMaterial: async (id: string) => {
    return api.patch<Material>(`/inventory/materials/${id}/restore`, {})
  },

  getArchivedMaterials: async () => {
    return api.get<Material[]>('/inventory/materials?includeInactive=true')
  },

  getMaterialRolls: async (materialId: string) => {
    return api.get<any[]>(`/inventory/materials/${materialId}/rolls`)
  }
}
