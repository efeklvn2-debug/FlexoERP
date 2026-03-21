import { procurementRepository } from './repository'
import { PurchaseOrderInput, RollInput, ReceivePOInput, AddLineItemInput, UpdatePOInput } from './validation'
import { PurchaseOrder, Roll } from './types'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { prisma } from '../../database'
import { inventoryService } from '../inventory/service'

const logger = createChildLogger('procurement:service')

export const procurementService = {
  // Purchase Orders
  async getAllPOs(status?: string): Promise<PurchaseOrder[]> {
    return procurementRepository.findAllPOs({ status })
  },

  async getPOById(id: string): Promise<PurchaseOrder> {
    const po = await procurementRepository.findPOById(id)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async createPO(input: PurchaseOrderInput, userId?: string): Promise<PurchaseOrder> {
    const poNumber = await procurementRepository.generatePONumber()
    logger.info({ poNumber, supplier: input.supplier, items: input.items.length }, 'Creating purchase order with line items')
    
    const totalAmount = input.items.reduce((sum, item) => {
      return sum + (Number(item.totalWeight) * Number(item.unitPrice))
    }, 0)

    return procurementRepository.createPOWithItems({
      poNumber,
      supplier: input.supplier,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes,
      createdById: userId,
      totalAmount,
      items: input.items.map(item => ({
        materialId: item.materialId,
        quantity: item.quantity,
        totalWeight: item.totalWeight,
        unitPrice: item.unitPrice,
        rollWeights: item.rollWeights || []
      }))
    })
  },

  async updatePO(id: string, input: UpdatePOInput): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }
    
    logger.info({ poId: id, updates: input }, 'Updating purchase order')
    return procurementRepository.updatePO(id, {
      supplier: input.supplier,
      expectedDate: input.expectedDate ? new Date(input.expectedDate) : undefined,
      notes: input.notes
    })
  },

  async addLineItem(poId: string, input: AddLineItemInput): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(poId)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }

    logger.info({ poId, materialId: input.materialId }, 'Adding line item to PO')
    await prisma.pOLineItem.create({
      data: {
        purchaseOrderId: poId,
        materialId: input.materialId,
        quantity: input.quantity,
        totalWeight: input.totalWeight,
        unitPrice: input.unitPrice,
        rollWeights: input.rollWeights || []
      }
    })

    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async removeLineItem(poId: string, lineItemId: string): Promise<PurchaseOrder> {
    const existing = await procurementRepository.findPOById(poId)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only edit pending purchase orders')
    }

    logger.info({ poId, lineItemId }, 'Removing line item from PO')
    await prisma.pOLineItem.delete({ where: { id: lineItemId } })

    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    return po
  },

  async deletePO(id: string): Promise<void> {
    const existing = await procurementRepository.findPOById(id)
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (existing.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_OPERATION', 'Can only delete pending purchase orders')
    }
    
    logger.info({ poId: id }, 'Deleting purchase order')
    await procurementRepository.deletePO(id)
  },

  async receivePO(poId: string, userId?: string): Promise<{ po: PurchaseOrder; rolls: Roll[] }> {
    const po = await procurementRepository.findPOById(poId)
    if (!po) throw new AppError(404, 'NOT_FOUND', 'Purchase order not found')
    if (po.status === 'RECEIVED') throw new AppError(400, 'INVALID_OPERATION', 'PO already fully received')
    if (po.status === 'CANCELLED') throw new AppError(400, 'INVALID_OPERATION', 'PO is cancelled')

    logger.info({ poId, lineItems: po.items?.length }, 'Receiving purchase order - handling different category types')

    const allRolls: Roll[] = []

    for (const lineItem of po.items || []) {
      const material = await prisma.material.findUnique({ where: { id: lineItem.materialId } })
      if (!material) continue

      if (material.category === 'PLAIN_ROLLS') {
        const rollWeights = (lineItem.rollWeights as number[] || []).length > 0 
          ? lineItem.rollWeights as number[]
          : Array(lineItem.quantity).fill(Number(lineItem.totalWeight) / lineItem.quantity)

        const rolls = await procurementRepository.createRollsFromWeights(
          poId,
          lineItem.materialId,
          rollWeights
        )
        allRolls.push(...rolls)
      }

      await inventoryService.addStock(
        lineItem.materialId, 
        material.category === 'PACKAGING' ? lineItem.quantity : Number(lineItem.totalWeight), 
        `PO ${po.poNumber} received`, 
        poId
      )

      await procurementRepository.updateLineItemReceivedQty(lineItem.id, lineItem.quantity)
    }

    const updatedPO = await procurementRepository.updatePO(poId, {
      status: 'RECEIVED',
      receivedDate: new Date()
    })

    logger.info({ poId, rollsCreated: allRolls.length }, 'PO received successfully')
    return { po: updatedPO, rolls: allRolls }
  },

  // Rolls
  async getAllRolls(materialId?: string, status?: string): Promise<Roll[]> {
    return procurementRepository.findAllRolls({ materialId, status })
  },

  async getRollById(id: string): Promise<Roll> {
    const roll = await procurementRepository.findRollById(id)
    if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found')
    return roll
  },

  async createRoll(input: RollInput): Promise<Roll> {
    const rollNumber = await procurementRepository.generateRollNumber()
    logger.info({ rollNumber, materialId: input.materialId }, 'Creating roll')
    return procurementRepository.createRoll({
      rollNumber,
      materialId: input.materialId,
      purchaseOrderId: input.purchaseOrderId,
      weight: input.weight,
      width: input.width,
      length: input.length,
      coreSize: input.coreSize,
      notes: input.notes
    })
  },

  async createMultipleRolls(materialId: string, count: number, weights: number[], purchaseOrderId?: string): Promise<Roll[]> {
    const rolls = []
    for (let i = 0; i < count; i++) {
      const rollNumber = await procurementRepository.generateRollNumber()
      rolls.push({
        rollNumber,
        materialId,
        purchaseOrderId,
        weight: weights[i],
        notes: ''
      })
    }
    logger.info({ count, materialId }, 'Creating multiple rolls')
    return procurementRepository.createRolls(rolls)
  }
}
