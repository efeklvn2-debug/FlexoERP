import { inventoryRepository } from './repository'
import { MaterialInput, MaterialUpdateInput, StockMovementInput } from './validation'
import { Material, MaterialWithStock, StockMovement } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { prisma } from '../../database'

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

  async adjustStock(id: string, newQuantity: number, reason: string): Promise<Material> {
    const existing = await inventoryRepository.findMaterialById(id)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId: id, newQuantity, reason }, 'Adjusting material stock')
    
    const existingAny = existing as any
    const existingNotes = existingAny.notes || ''
    const newNotes = existingNotes + `\n[${new Date().toISOString()}] Stock adjusted from ${existingAny.totalStock || 0} to ${newQuantity}. Reason: ${reason}`
    
    await prisma.$executeRaw`
      UPDATE "Material" 
      SET "totalStock" = ${newQuantity}, "notes" = ${newNotes}, "updatedAt" = NOW()
      WHERE "id" = ${id}
    `
    
    // Fetch and return updated material
    const updated = await prisma.material.findUnique({ where: { id } })
    if (!updated) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update material')
    }
    
    return updated as any as Material
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
  },

  async recordCoreChange(quantity: number, type: 'PRODUCTION_OUT' | 'CORE_RECOVERY' | 'CORE_BUYBACK', reference?: string, userId?: string): Promise<StockMovement | null> {
    let coreMaterial = await prisma.material.findFirst({
      where: {
        category: 'PACKAGING',
        subCategory: 'CORE'
      }
    })

    if (!coreMaterial) {
      logger.info('Creating core material for inventory tracking...')
      coreMaterial = await prisma.material.create({
        data: {
          code: 'CORE',
          name: 'Core',
          category: 'PACKAGING',
          subCategory: 'CORE',
          unitOfMeasure: 'pcs',
          minStock: 0,
          isActive: true
        }
      })
    }

    const stock = await inventoryRepository.getOrCreateStock(coreMaterial.id, 'MAIN')
    await inventoryRepository.updateStockQuantity(stock.id, quantity)

    let movementType = 'IN'
    let notes = ''

    switch (type) {
      case 'PRODUCTION_OUT':
        movementType = 'OUT'
        notes = `Production: -${Math.abs(quantity)} cores`
        break
      case 'CORE_RECOVERY':
        movementType = 'IN'
        notes = `Core recovery: +${quantity} cores`
        break
      case 'CORE_BUYBACK':
        movementType = 'IN'
        notes = `Core buyback: +${quantity} cores`
        break
    }

    return inventoryRepository.createStockMovement({
      materialId: coreMaterial.id,
      stockId: stock.id,
      type: movementType,
      quantity: Math.abs(quantity),
      reference,
      notes,
      createdById: userId
    })
  },

  async recordPackingBagChange(materialId: string, quantity: number, type: 'PURCHASE' | 'SALE', reference?: string, userId?: string): Promise<StockMovement | null> {
    const material = await inventoryRepository.findMaterialById(materialId)
    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Packing bag material not found')
    }

    const stock = await inventoryRepository.getOrCreateStock(materialId, 'MAIN')
    
    if (type === 'PURCHASE') {
      await inventoryRepository.updateStockQuantity(stock.id, Math.abs(quantity))
    } else {
      await inventoryRepository.updateStockQuantity(stock.id, -Math.abs(quantity))
    }

    return inventoryRepository.createStockMovement({
      materialId,
      stockId: stock.id,
      type: type === 'PURCHASE' ? 'IN' : 'OUT',
      quantity: Math.abs(quantity),
      reference,
      notes: `${type === 'PURCHASE' ? 'Purchase' : 'Sale'}: ${Math.abs(quantity)} ${material.unitOfMeasure}`,
      createdById: userId
    })
  },

  async getCoreStock(): Promise<{ stock: number; movements: StockMovement[] }> {
    const coreMaterial = await prisma.material.findFirst({
      where: {
        category: 'PACKAGING',
        subCategory: 'CORE'
      },
      include: { stocks: true }
    })

    if (!coreMaterial) {
      return { stock: 0, movements: [] }
    }

    const stock = coreMaterial.stocks?.[0]?.quantity || 0

    const movements = await prisma.stockMovement.findMany({
      where: { materialId: coreMaterial.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    return { stock, movements }
  },

  async getPackingBagStock(days = 60): Promise<{ materials: any[]; movements: any[] }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const materials = await prisma.material.findMany({
      where: {
        category: 'PACKAGING',
        subCategory: { not: 'CORE' }
      },
      include: { stocks: true }
    })

    const materialsWithStock = materials.map(m => ({
      id: m.id,
      name: m.name,
      code: m.code,
      unit: m.unitOfMeasure,
      stock: m.stocks?.[0]?.quantity || 0
    }))

    const movements = await prisma.stockMovement.findMany({
      where: {
        material: { category: 'PACKAGING' },
        createdAt: { gte: cutoffDate }
      },
      include: { material: true },
      orderBy: { createdAt: 'desc' }
    })

    return { materials: materialsWithStock, movements }
  },

  async initializeStock(
    materials: { materialId: string; quantity: number }[],
    date: Date,
    userId?: string
  ): Promise<{ success: boolean; updated: number; movements: StockMovement[] }> {
    const movements: StockMovement[] = []
    let updated = 0

    for (const item of materials) {
      const material = await inventoryRepository.findMaterialById(item.materialId)
      if (!material) continue

      const stock = await inventoryRepository.getOrCreateStock(item.materialId, 'MAIN')
      const currentQty = stock.quantity || 0
      const difference = item.quantity - currentQty

      if (difference !== 0) {
        await inventoryRepository.updateStockQuantity(stock.id, difference)

        const movement = await inventoryRepository.createStockMovement({
          materialId: item.materialId,
          stockId: stock.id,
          type: 'INITIAL',
          quantity: Math.abs(difference),
          reference: `INIT-${new Date().toISOString().split('T')[0]}`,
          notes: `Initial stock: ${difference > 0 ? 'Added' : 'Reduced'} ${Math.abs(difference)} ${material.unitOfMeasure} (was ${currentQty}, now ${item.quantity})`,
          createdById: userId
        })

        movements.push(movement)
        updated++
      }
    }

    logger.info({ count: updated, date }, 'Stock initialized')

    return { success: true, updated, movements }
  },

  async getInitialStockMovements(limit = 100): Promise<StockMovement[]> {
    return prisma.stockMovement.findMany({
      where: { type: 'INITIAL' },
      include: { material: true },
      orderBy: { createdAt: 'desc' },
      take: limit
    })
  }
}
