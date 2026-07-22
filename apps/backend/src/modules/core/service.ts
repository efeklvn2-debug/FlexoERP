import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { inventoryService } from '../inventory/service'
import { settingsService } from '../settings/service'
import { salesOrderService } from '../salesOrders/service'
import { paymentService } from '../salesOrders/service'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('core:service')

export const coreManagementService = {
  /**
   * Calculate core deposit for a sales order based on settings and specs
   * @param salesOrderId The sales order ID
   * @returns The calculated core deposit amount
   */
  async calculateCoreDeposit(salesOrderId: string): Promise<number> {
    const order = await salesOrderService.getOrderById(salesOrderId)
    const settings = await settingsService.getSettings()
    
    // Core deposit calculation: number of cores needed * core deposit value
    // Number of cores needed is typically the quantity ordered (one core per roll)
    const coresNeeded = Number(order.quantityOrdered)
    const coreDepositValue = Number(settings.coreDepositValue || 150)
    
    return coresNeeded * coreDepositValue
  },

  /**
   * Apply core deposit when a sales order is paid (deposit paid)
   * @param salesOrderId The sales order ID
   * @param userId The user ID recording the transaction
   */
  async applyCoreDeposit(salesOrderId: string, userId?: string): Promise<void> {
    const order = await salesOrderService.getOrderById(salesOrderId)
    const coreDeposit = await this.calculateCoreDeposit(salesOrderId)
    
    // Create a payment transaction for the core deposit
    await paymentService.recordPayment({
      salesOrderId,
      transactionType: 'DEPOSIT',
      paymentMethod: 'CASH', // or however the deposit is paid
      amount: coreDeposit
    }, userId)
    
    logger.info({ salesOrderId, coreDeposit }, 'Core deposit applied to sales order')
  },

  /**
   * Process core return from customer at pickup
   * @param salesOrderId The sales order ID
   * @param coresReturned Number of cores returned by customer
   * @param userId The user ID recording the transaction
   */
  async processCoreReturn(salesOrderId: string, coresReturned: number, userId?: string): Promise<void> {
    const order = await salesOrderService.getOrderById(salesOrderId)
    const settings = await settingsService.getSettings()
    const coreValue = coresReturned * Number(settings.coreDepositValue || 150)
    
    // Increase core stock (returned cores)
    // We need to find the core material
    const coreMaterial = await prisma.material.findFirst({
      where: {
        OR: [
          { name: { contains: 'core', mode: 'insensitive' } },
          { code: { contains: 'core', mode: 'insensitive' } }
        ]
      }
    })
    
    if (coreMaterial) {
      await inventoryService.addStock(
        coreMaterial.id,
        coresReturned, // Positive because we're receiving cores
        `Returned by customer for order ${order.orderNumber}`,
        undefined
      )
    }
    
    logger.info({ 
      salesOrderId, 
      coresReturned, 
      coreValue 
    }, 'Core return processed and customer credited')
  },

  /**
   * Process core purchase from a random person (not a customer)
   * @param coresQuantity Number of cores purchased
   * @param paymentMethod How the cores were paid for (Cash, Electronic, etc.)
   * @param referenceNumber Optional reference number
   * @param notes Optional notes
   * @param userId The user ID recording the transaction
   * @returns The core buyback record
   */
  async processRandomCorePurchase(
    coresQuantity: number, 
    paymentMethod: 'Cash' | 'Electronic',
    referenceNumber?: string,
    notes?: string,
    userId?: string
  ) {
    const settings = await settingsService.getSettings()
    const ratePerCore = Number(settings.coreDepositValue || 150)
    const totalValue = coresQuantity * ratePerCore
    
    // Find core material (to increase stock)
    const coreMaterial = await prisma.material.findFirst({
      where: {
        OR: [
          { name: { contains: 'core', mode: 'insensitive' } },
          { code: { contains: 'core', mode: 'insensitive' } }
        ]
      }
    })
    
    if (!coreMaterial) {
      throw new AppError(400, 'INVALID', 'Core material not found in system')
    }
    
    // Increase core stock (purchased cores)
    await inventoryService.addStock(
      coreMaterial.id,
      coresQuantity, // Positive because we're adding to stock
      `Purchased from random person`,
      referenceNumber
    )
    
    // Record the core buyback transaction (company buying from random person)
    const coreBuyback = await prisma.coreBuyback.create({
      data: {
        sellerName: notes || 'Random Person',
        coresQuantity,
        ratePerCore: new Prisma.Decimal(String(ratePerCore)),
        totalValue: new Prisma.Decimal(String(totalValue)),
        paymentMethod: paymentMethod as any,
        paidAmount: new Prisma.Decimal(String(totalValue)),
        recordedById: userId,
        notes: notes || `Core purchase from random person`
      } as any
    })
    
    // Also create a payment transaction for this purchase (money out)
    // Note: This is an expense for the company, so we might want to record it in the expense module
    // For now, we'll just record the core buyback and the stock increase.
    // The financial impact (cash out) would be handled elsewhere (e.g., expense module or direct cash tracking).
    
    logger.info({ 
      coresQuantity, 
      totalValue, 
      coreBuybackId: coreBuyback.id 
    }, 'Random person core purchase processed')
    
    return coreBuyback
  },

  async getTotalCoreStock(): Promise<number> {
    // Find core material
    const coreMaterial = await prisma.material.findFirst({
      where: {
        OR: [
          { name: { contains: 'core', mode: 'insensitive' } },
          { code: { contains: 'core', mode: 'insensitive' } }
        ]
      }
    })
    
    if (!coreMaterial) {
      return 0
    }
    
    const materialsWithStock = await inventoryService.getMaterialsWithStock()
    const stockItem = materialsWithStock.find(m => m.id === coreMaterial.id)
    return stockItem ? stockItem.totalStock : 0
  },

}