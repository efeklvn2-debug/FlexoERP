import { Prisma } from '@prisma/client'
import { prisma } from '../../database'
import { Material, Stock, StockMovement, MaterialWithStock, MaterialCategory } from './types'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('inventory:repository')

export const inventoryRepository = {
  async findMaterialById(id: string): Promise<Material | null> {
    const material = await prisma.material.findUnique({ where: { id } })
    return material as Material | null
  },

  async findMaterialByCode(code: string): Promise<Material | null> {
    const material = await prisma.material.findUnique({ where: { code } })
    return material as Material | null
  },

  async findAllMaterials(includeInactive = false): Promise<Material[]> {
    const where = includeInactive ? {} : { isActive: true }
    const materials = await prisma.material.findMany({
      where,
      orderBy: { name: 'asc' }
    })
    return materials.map(m => ({
      ...m,
      costPrice: m.costPrice ? Number(m.costPrice) : null
    })) as Material[]
  },

  async findMaterialsWithStock(): Promise<MaterialWithStock[]> {
    const materials = await prisma.material.findMany({
      where: { isActive: true },
      include: {
        stocks: true,
        rolls: { where: { status: 'AVAILABLE' } }
      },
      orderBy: { name: 'asc' }
    })

    return materials.map(m => {
      let totalStock: number
      
      if (m.category === 'PLAIN_ROLLS') {
        // For parent rolls, calculate from available rolls only
        totalStock = m.rolls.reduce((sum, r) => sum + Number(r.remainingWeight), 0)
      } else {
        // For other materials, use stock table
        totalStock = m.stocks.reduce((sum, s) => sum + s.quantity, 0)
      }

      return {
        ...m,
        costPrice: m.costPrice ? Number(m.costPrice) : null,
        totalStock,
        locations: m.stocks.map(s => ({ location: s.location || '', quantity: s.quantity }))
      }
    }) as MaterialWithStock[]
  },

  async getMaterialRolls(materialId: string) {
    return prisma.roll.findMany({
      where: { materialId },
      orderBy: { createdAt: 'desc' }
    })
  },

  async createMaterial(data: {
    code: string
    name: string
    category: MaterialCategory
    unitOfMeasure?: string
    minStock?: number
    costPrice?: number
  }): Promise<Material> {
    const material = await prisma.material.create({ 
      data: {
        code: data.code,
        name: data.name,
        category: data.category,
        unitOfMeasure: data.unitOfMeasure,
        minStock: data.minStock,
        costPrice: data.costPrice
      }
    })
    logger.info({ materialId: material.id, code: material.code }, 'Material created')
    return { ...material, costPrice: material.costPrice ? Number(material.costPrice) : null } as Material
  },

  async updateMaterial(id: string, data: Partial<Prisma.MaterialUpdateInput>): Promise<Material> {
    const material = await prisma.material.update({ where: { id }, data })
    return { ...material, costPrice: material.costPrice ? Number(material.costPrice) : null } as Material
  },

  async deleteMaterial(id: string): Promise<void> {
    await prisma.material.update({ where: { id }, data: { isActive: false } })
    logger.info({ materialId: id }, 'Material deactivated')
  },

  async getStock(materialId: string): Promise<Stock[]> {
    return prisma.stock.findMany({ where: { materialId } }) as Promise<Stock[]>
  },

  async getOrCreateStock(materialId: string, location?: string): Promise<Stock> {
    const stock = await prisma.stock.upsert({
      where: { materialId_location: { materialId, location: location || '' } },
      create: { materialId, quantity: 0, location: location || '' },
      update: {},
      include: { material: true }
    })
    return stock as Stock
  },

  async createStockMovement(data: {
    materialId: string
    stockId?: string
    type: string
    quantity: number
    reference?: string
    notes?: string
    createdById?: string
  }): Promise<StockMovement> {
    return prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          materialId: data.materialId,
          stockId: data.stockId,
          type: data.type as any,
          quantity: data.quantity,
          reference: data.reference,
          notes: data.notes,
          createdById: data.createdById
        }
      })

      if (data.stockId) {
        const stock = await tx.stock.findUnique({ where: { id: data.stockId } })
        if (stock) {
          let newQuantity = stock.quantity
          if (data.type === 'IN' || data.type === 'ADJUSTMENT') {
            newQuantity += data.quantity
          } else if (data.type === 'OUT') {
            newQuantity -= data.quantity
          }
          await tx.stock.update({
            where: { id: data.stockId },
            data: { quantity: newQuantity }
          })
        }
      }

      logger.info({ movementId: movement.id, type: data.type, materialId: data.materialId }, 'Stock movement created')
      return movement as StockMovement
    })
  },

  async getStockMovements(materialId?: string, limit = 50): Promise<StockMovement[]> {
    const where = materialId ? { materialId } : {}
    return prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { material: true }
    }) as Promise<StockMovement[]>
  },

  async updateStockQuantity(stockId: string, quantityToAdd: number): Promise<Stock> {
    const stock = await prisma.stock.update({
      where: { id: stockId },
      data: { quantity: { increment: quantityToAdd } }
    })
    return stock as Stock
  }
}
