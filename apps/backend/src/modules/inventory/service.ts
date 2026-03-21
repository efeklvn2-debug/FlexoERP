import { inventoryRepository } from './repository'
import { MaterialInput, MaterialUpdateInput, StockMovementInput } from './validation'
import { Material, MaterialWithStock, StockMovement } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('inventory:service')

export const inventoryService = {
  async getAllMaterials(): Promise<Material[]> {
    return inventoryRepository.findAllMaterials()
  },

  async getMaterialsWithStock(): Promise<MaterialWithStock[]> {
    return inventoryRepository.findMaterialsWithStock()
  },

  async getMaterialById(id: string): Promise<Material> {
    const material = await inventoryRepository.findMaterialById(id)
    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }
    return material
  },

  async createMaterial(input: MaterialInput, userId?: string): Promise<Material> {
    const existing = await inventoryRepository.findMaterialByCode(input.code)
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Material code already exists')
    }

    logger.info({ code: input.code, name: input.name, userId }, 'Creating material')
    return inventoryRepository.createMaterial({
      ...input,
      unitOfMeasure: input.unitOfMeasure || 'pcs',
      minStock: input.minStock || 0
    })
  },

  async updateMaterial(id: string, input: MaterialUpdateInput, userId?: string): Promise<Material> {
    const existing = await inventoryRepository.findMaterialById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    if (input.code && input.code !== existing.code) {
      const codeExists = await inventoryRepository.findMaterialByCode(input.code)
      if (codeExists) {
        throw new AppError(409, 'CONFLICT', 'Material code already exists')
      }
    }

    logger.info({ materialId: id, updates: input, userId }, 'Updating material')
    return inventoryRepository.updateMaterial(id, input)
  },

  async archiveMaterial(id: string): Promise<Material> {
    const existing = await inventoryRepository.findMaterialById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId: id }, 'Archiving material')
    return inventoryRepository.updateMaterial(id, { isActive: false })
  },

  async restoreMaterial(id: string): Promise<Material> {
    const existing = await inventoryRepository.findMaterialById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId: id }, 'Restoring material')
    return inventoryRepository.updateMaterial(id, { isActive: true })
  },

  async deleteMaterial(id: string, userId?: string): Promise<void> {
    const existing = await inventoryRepository.findMaterialById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId: id, userId }, 'Deactivating material')
    await inventoryRepository.deleteMaterial(id)
  },

  async recordStockMovement(input: StockMovementInput, userId?: string): Promise<StockMovement> {
    const material = await inventoryRepository.findMaterialById(input.materialId)
    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    let stockId = input.stockId

    if (!stockId && input.type !== 'ADJUSTMENT') {
      const stock = await inventoryRepository.getOrCreateStock(input.materialId, input.reference || undefined)
      stockId = stock.id
    }

    logger.info({ materialId: input.materialId, type: input.type, quantity: input.quantity, userId }, 'Recording stock movement')
    return inventoryRepository.createStockMovement({
      materialId: input.materialId,
      stockId,
      type: input.type,
      quantity: input.quantity,
      reference: input.reference,
      notes: input.notes,
      createdById: userId
    })
  },

  async getStockMovements(materialId?: string, limit = 50): Promise<StockMovement[]> {
    return inventoryRepository.getStockMovements(materialId, limit)
  },

  async getMaterialRolls(materialId: string) {
    return inventoryRepository.getMaterialRolls(materialId)
  },

  async addStock(materialId: string, quantity: number, notes?: string, reference?: string, userId?: string): Promise<StockMovement> {
    const material = await inventoryRepository.findMaterialById(materialId)
    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId, quantity, reference }, 'Adding stock')
    
    const stock = await inventoryRepository.getOrCreateStock(materialId, 'MAIN')
    
    await inventoryRepository.updateStockQuantity(stock.id, quantity)
    
    return inventoryRepository.createStockMovement({
      materialId,
      stockId: stock.id,
      type: 'IN',
      quantity,
      reference,
      notes,
      createdById: userId
    })
  }
}
