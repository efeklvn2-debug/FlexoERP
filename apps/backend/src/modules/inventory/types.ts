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
  subCategory?: string | null
  unitOfMeasure: string
  minStock: number
  costPrice?: number | null
  packSize?: number | null
  drumSize?: number | null
  coreWeight?: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MaterialWithStock extends Material {
  totalStock: number
  locations: { location: string; quantity: number }[]
}

export interface Stock {
  id: string
  materialId: string
  quantity: number
  location: string | null
  createdAt: Date
  updatedAt: Date
}

export interface StockMovement {
  id: string
  materialId: string
  stockId: string | null
  type: MovementType
  quantity: number
  reference: string | null
  notes: string | null
  createdAt: Date
  createdById: string | null
}
