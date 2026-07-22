import { inventoryRepository } from './repository'
import { MaterialInput, MaterialUpdateInput, StockMovementInput } from './validation'
import { Material, MaterialWithStock, StockMovement } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { prisma } from '../../database'
import { financeService } from '../finance/service'
import { getCurrentTenantId } from '../../context'

const logger = createChildLogger('inventory:service')

export const inventoryService = {
  async getSubCategories(): Promise<Record<string, string[]>> {
    const materials = await prisma.material.findMany({
      where: { subCategory: { not: null }, isActive: true },
      select: { category: true, subCategory: true },
      distinct: ['category', 'subCategory']
    })

    const grouped: Record<string, string[]> = {}
    for (const m of materials) {
      const cat = m.category
      const sub = m.subCategory!
      if (!grouped[cat]) grouped[cat] = []
      if (!grouped[cat].includes(sub)) grouped[cat].push(sub)
    }

    return grouped
  },

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

    const subCategory = input.subCategory || input.name.replace(/[^a-zA-Z0-9]/g, '')

    logger.info({ code: input.code, name: input.name, userId }, 'Creating material')
    return inventoryRepository.createMaterial({
      ...input,
      subCategory,
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

    // Update Stock table via createStockMovement's built-in arithmetic
    const stock = await inventoryRepository.getOrCreateStock(id, 'MAIN')
    const currentQty = stock.quantity || 0
    const difference = newQuantity - currentQty

    if (difference !== 0) {
      const isIncrease = difference > 0
      await inventoryRepository.createStockMovement({
        materialId: id,
        stockId: stock.id,
        type: isIncrease ? 'ADJUSTMENT' : 'OUT',
        quantity: Math.abs(difference),
        notes: `Stock adjusted: ${currentQty} → ${newQuantity}. Reason: ${reason}`
      })
    }

    // Append audit trail to Material.notes
    const existingAny = existing as any
    const existingNotes = existingAny.notes || ''
    const newNotes = existingNotes + `\n[${new Date().toISOString()}] Stock adjusted from ${currentQty} to ${newQuantity}. Reason: ${reason}`
    await prisma.$executeRaw`
      UPDATE "Material"
      SET "notes" = ${newNotes}, "updatedAt" = NOW()
      WHERE "id" = ${id} AND "tenantId" = ${getCurrentTenantId()}
    `

    const updated = await inventoryRepository.findMaterialById(id)
    if (!updated) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update material')
    }
    return updated
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

  async addStock(materialId: string, quantity: number, notes?: string, reference?: string, userId?: string, tx?: any): Promise<StockMovement> {
    const db = tx || prisma
    const material = await inventoryRepository.findMaterialById(materialId)
    if (!material) {
      throw new AppError(404, 'NOT_FOUND', 'Material not found')
    }

    logger.info({ materialId, quantity, reference }, 'Adding stock')
    
    const stock = await inventoryRepository.getOrCreateStock(materialId, 'MAIN', tx)
    
    return inventoryRepository.createStockMovement({
      materialId,
      stockId: stock.id,
      type: quantity >= 0 ? 'IN' : 'OUT',
      quantity: Math.abs(quantity),
      reference,
      notes,
      createdById: userId
    }, tx)
  },

  async recordCoreChange(quantity: number, type: 'PRODUCTION_OUT' | 'CORE_RECOVERY' | 'CORE_BUYBACK', reference?: string, userId?: string, tx?: any): Promise<StockMovement | null> {
    const db = tx || prisma

    let coreMaterial = await db.material.findFirst({
      where: {
        category: 'PACKAGING',
        subCategory: 'CORE'
      }
    })

    if (!coreMaterial) {
      logger.info('Creating core material for inventory tracking...')
      coreMaterial = await db.material.create({
        data: {
          code: 'CORE',
          name: 'Core',
          category: 'PACKAGING',
          subCategory: 'CORE',
          unitOfMeasure: 'pcs',
          minStock: 0,
          isActive: true
        } as any
      })
    }

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

    const stock = await inventoryRepository.getOrCreateStock(coreMaterial.id, 'MAIN', tx)
    return inventoryRepository.createStockMovement({
      materialId: coreMaterial.id,
      stockId: stock.id,
      type: movementType,
      quantity: Math.abs(quantity),
      reference,
      notes,
      createdById: userId
    }, tx)
  },

  async recordPackingBagChange(materialId: string, quantity: number, type: 'PURCHASE' | 'SALE', reference?: string, userId?: string, tx?: any): Promise<StockMovement | null> {
    const execute = async (client: any) => {
      const material = await inventoryRepository.findMaterialById(materialId)
      if (!material) {
        throw new AppError(404, 'NOT_FOUND', 'Packing bag material not found')
      }

      const stock = await inventoryRepository.getOrCreateStock(materialId, 'MAIN', client)

      return inventoryRepository.createStockMovement({
        materialId,
        stockId: stock.id,
        type: type === 'PURCHASE' ? 'IN' : 'OUT',
        quantity: Math.abs(quantity),
        reference,
        notes: `${type === 'PURCHASE' ? 'Purchase' : 'Sale'}: ${Math.abs(quantity)} ${material.unitOfMeasure}`,
        createdById: userId
      }, client)
    }

    if (tx) return execute(tx)
    return prisma.$transaction(execute)
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
  ): Promise<{ success: boolean; updated: number; movements: StockMovement[]; journalEntry?: any }> {
    const movements: StockMovement[] = []
    let updated = 0
    let totalInventoryValue = 0
    let journalEntry: any = undefined

    await prisma.$transaction(async (tx) => {
      for (const item of materials) {
        const material = await inventoryRepository.findMaterialById(item.materialId)
        if (!material) continue

        const stock = await inventoryRepository.getOrCreateStock(item.materialId, 'MAIN', tx)
        const currentQty = stock.quantity || 0
        const difference = item.quantity - currentQty

        if (difference !== 0) {
          await tx.stock.update({
            where: { id: stock.id },
            data: { quantity: { increment: difference } }
          })

          const movement = await inventoryRepository.createStockMovement({
            materialId: item.materialId,
            stockId: stock.id,
            type: 'INITIAL',
            quantity: Math.abs(difference),
            reference: `INIT-${new Date().toISOString().split('T')[0]}`,
            notes: `Initial stock: ${difference > 0 ? 'Added' : 'Reduced'} ${Math.abs(difference)} ${material.unitOfMeasure} (was ${currentQty}, now ${item.quantity})`,
            createdById: userId
          }, tx)

          movements.push(movement)
          updated++

          if (material.costPrice) {
            totalInventoryValue += Number(material.costPrice) * item.quantity
          }
        }
      }

      if (totalInventoryValue > 0) {
        const inventoryAccountId = await financeService.getAccountIdByCode('1300')
        const equityAccountId = await financeService.getAccountIdByCode('3000')
        journalEntry = await financeService.postJournalEntry({
          description: `Initial stock valuation — ${updated} material(s)`,
          sourceModule: 'OPENING',
          sourceId: `INIT-${new Date().toISOString().split('T')[0]}`,
          postedById: userId,
          date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
          lines: [
            { accountId: inventoryAccountId, debit: totalInventoryValue, credit: 0, memo: 'Initial stock at cost' },
            { accountId: equityAccountId, debit: 0, credit: totalInventoryValue, memo: 'Opening balance equity — inventory initialization' }
          ]
        }, tx)
        logger.info({ totalInventoryValue, materialsCount: updated }, 'Journal entry posted for stock initialization')
      }
    })

    logger.info({ count: updated, date, totalInventoryValue }, 'Stock initialized')

    return { success: true, updated, movements, journalEntry }
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
