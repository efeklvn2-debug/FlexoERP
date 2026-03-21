import { Prisma } from '@prisma/client'
import { prisma } from '../../database'
import { PurchaseOrder, Roll } from './types'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('procurement:repository')

const convertPO = (po: any): PurchaseOrder => ({
  ...po,
  totalAmount: po.totalAmount ? Number(po.totalAmount) : undefined,
  rolls: po.rolls?.map((r: any) => convertRoll(r)),
  items: po.items?.map((item: any) => ({
    ...item,
    totalWeight: Number(item.totalWeight),
    unitPrice: Number(item.unitPrice)
  }))
})

const convertRoll = (r: any): Roll => ({
  ...r,
  weight: Number(r.weight),
  remainingWeight: Number(r.remainingWeight),
  width: r.width ? Number(r.width) : undefined,
  length: r.length ? Number(r.length) : undefined
})

export const procurementRepository = {
  // Purchase Order methods
  async findPOById(id: string): Promise<PurchaseOrder | null> {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { 
        rolls: { include: { material: true } },
        items: { include: { material: true } }
      }
    })
    return po ? convertPO(po) : null
  },

  async findAllPOs(filters?: { status?: string }): Promise<PurchaseOrder[]> {
    const where: Prisma.PurchaseOrderWhereInput = {}
    if (filters?.status) where.status = filters.status as any

    const pos = await prisma.purchaseOrder.findMany({
      where,
      include: { 
        rolls: { include: { material: true } },
        items: { include: { material: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    return pos.map(convertPO)
  },

  async generatePONumber(): Promise<string> {
    const today = new Date()
    const prefix = `PO-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
    
    const lastPO = await prisma.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' }
    })

    if (lastPO) {
      const lastNumber = parseInt(lastPO.poNumber.replace(prefix, ''))
      return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`
    }

    return `${prefix}0001`
  },

  async createPO(data: {
    poNumber: string
    supplier: string
    expectedDate?: Date
    notes?: string
    createdById?: string
  }): Promise<PurchaseOrder> {
    const po = await prisma.purchaseOrder.create({
      data,
      include: { rolls: true, items: { include: { material: true } } }
    })
    logger.info({ poId: po.id, poNumber: po.poNumber }, 'Purchase order created')
    return convertPO(po)
  },

  async createPOWithItems(data: {
    poNumber: string
    supplier: string
    expectedDate?: Date
    notes?: string
    createdById?: string
    totalAmount: number
    items: {
      materialId: string
      quantity: number
      totalWeight: number
      unitPrice: number
      rollWeights: number[]
    }[]
  }): Promise<PurchaseOrder> {
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: data.poNumber,
        supplier: data.supplier,
        expectedDate: data.expectedDate,
        notes: data.notes,
        createdById: data.createdById,
        totalAmount: data.totalAmount,
        items: {
          create: data.items.map(item => ({
            materialId: item.materialId,
            quantity: item.quantity,
            totalWeight: item.totalWeight,
            unitPrice: item.unitPrice,
            rollWeights: item.rollWeights
          }))
        }
      },
      include: { 
        rolls: true,
        items: { include: { material: true } }
      }
    })
    logger.info({ poId: po.id, poNumber: po.poNumber, itemCount: data.items.length }, 'Purchase order with line items created')
    return convertPO(po)
  },

  async updateLineItemReceivedQty(lineItemId: string, qty: number): Promise<void> {
    await prisma.pOLineItem.update({
      where: { id: lineItemId },
      data: { receivedQty: { increment: qty } }
    })
  },

  async createRollsFromWeights(purchaseOrderId: string, materialId: string, weights: number[]): Promise<Roll[]> {
    const createdRolls: Roll[] = []
    
    await prisma.$transaction(async (tx) => {
      const today = new Date()
      const prefix = `RL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
      
      const lastRoll = await tx.roll.findFirst({
        where: { rollNumber: { startsWith: prefix } },
        orderBy: { rollNumber: 'desc' }
      })
      
      let startNumber = lastRoll ? parseInt(lastRoll.rollNumber.replace(prefix, '')) : 0
      
      for (const weight of weights) {
        startNumber++
        const rollNumber = `${prefix}${String(startNumber).padStart(4, '0')}`
        
        const roll = await tx.roll.create({
          data: {
            rollNumber,
            materialId,
            purchaseOrderId,
            weight,
            remainingWeight: weight,
            status: 'AVAILABLE',
            receivedDate: new Date(),
            notes: ''
          },
          include: { material: true }
        })
        
        createdRolls.push(convertRoll(roll))
      }
    })
    
    logger.info({ count: createdRolls.length, purchaseOrderId }, 'Rolls created from weights')
    return createdRolls
  },

  async updatePO(id: string, data: Partial<Prisma.PurchaseOrderUpdateInput>): Promise<PurchaseOrder> {
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { rolls: { include: { material: true } }, items: { include: { material: true } } }
    })
    return convertPO(po)
  },

  async deletePO(id: string): Promise<void> {
    await prisma.purchaseOrder.delete({ where: { id } })
  },

  // Roll methods
  async findRollById(id: string): Promise<Roll | null> {
    const roll = await prisma.roll.findUnique({
      where: { id },
      include: { material: true, purchaseOrder: true }
    })
    return roll ? convertRoll(roll) : null
  },

  async findRollByNumber(rollNumber: string): Promise<Roll | null> {
    const roll = await prisma.roll.findUnique({
      where: { rollNumber },
      include: { material: true, purchaseOrder: true }
    })
    return roll ? convertRoll(roll) : null
  },

  async findAllRolls(filters?: { materialId?: string; status?: string }): Promise<Roll[]> {
    const where: Prisma.RollWhereInput = {
      // Exclude printed rolls (they have rollNumbers starting with 'PR')
      rollNumber: { not: { startsWith: 'PR' } }
    }
    if (filters?.materialId) where.materialId = filters.materialId
    if (filters?.status) where.status = filters.status as any

    const rolls = await prisma.roll.findMany({
      where,
      include: { material: true, purchaseOrder: true },
      orderBy: { createdAt: 'desc' }
    })
    return rolls.map(convertRoll)
  },

  async generateRollNumber(): Promise<string> {
    const today = new Date()
    const prefix = `RL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
    
    const lastRoll = await prisma.roll.findFirst({
      where: { rollNumber: { startsWith: prefix } },
      orderBy: { rollNumber: 'desc' }
    })

    if (lastRoll) {
      const lastNumber = parseInt(lastRoll.rollNumber.replace(prefix, ''))
      return `${prefix}${String(lastNumber + 1).padStart(4, '0')}`
    }

    return `${prefix}0001`
  },

  async createRoll(data: {
    rollNumber: string
    materialId: string
    purchaseOrderId?: string
    weight: number
    width?: number
    length?: number
    coreSize?: string
    notes?: string
  }): Promise<Roll> {
    const roll = await prisma.roll.create({
      data: {
        ...data,
        remainingWeight: data.weight,
        status: 'AVAILABLE' as any,
        receivedDate: new Date()
      },
      include: { material: true }
    })
    logger.info({ rollId: roll.id, rollNumber: roll.rollNumber }, 'Roll created')
    return convertRoll(roll)
  },

  async createRolls(data: Array<{
    rollNumber: string
    materialId: string
    purchaseOrderId?: string
    weight: number
    width?: number
    length?: number
    coreSize?: string
    notes?: string
  }>): Promise<Roll[]> {
    const rolls = await prisma.roll.createManyAndReturn({
      data: data.map(d => ({
        ...d,
        remainingWeight: d.weight,
        status: 'AVAILABLE' as any,
        receivedDate: new Date()
      })),
      include: { material: true }
    })
    logger.info({ count: rolls.length }, 'Rolls created')
    return rolls.map(convertRoll)
  }
}
