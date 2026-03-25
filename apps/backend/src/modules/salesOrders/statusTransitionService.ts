import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { salesOrderService } from './service'
import { productionService } from '../production/service'
import { settingsService } from '../settings/service'
import { inventoryService } from '../inventory/service'
import { salesOrderRepository } from './repository'
import type { SpecsJson } from './types'
import { createChildLogger } from '../../logger'

const logger = createChildLogger('salesOrders:statusTransition')

export const salesOrderStatusTransitionService = {
  /**
   * Approve a sales order and check material availability
   * @param id Sales order ID
   * @param userId User ID performing the action
   */
  async approveOrder(id: string, userId?: string) {
    const order = await salesOrderService.getOrderById(id)
    
    if (order.status !== 'PENDING') {
      throw new AppError(400, 'INVALID', 'Order is not in pending status')
    }

    // Check if we have specs to determine required materials
    let hasRequiredMaterials = true
    let missingMaterials: Array<{ materialId: string; materialName: string; required: number; available: number }> = []
    
    try {
      // Parse specs to get material requirements
      const specs = typeof order.specsJson === 'string' ? JSON.parse(order.specsJson) : order.specsJson
      
      if (specs && typeof specs === 'object') {
        // Extract material requirements from specs
        // This is a simplified check - in reality, you'd have a BOM
        const materialRequirements = this.extractMaterialRequirements(specs)
        
        for (const req of materialRequirements) {
          const material = await inventoryService.getMaterialById(req.materialId)
          // For now, we'll just check if material exists
          hasRequiredMaterials = hasRequiredMaterials && !!material
          
          if (!material) {
            missingMaterials.push({
              materialId: req.materialId,
              materialName: req.materialName || `Material ${req.materialId}`,
              required: req.required,
              available: 0
            })
          }
        }
      }
    } catch (error) {
      // If we can't parse specs, we assume materials need to be checked manually
      hasRequiredMaterials = false
    }

    // Update order status to APPROVED
    await salesOrderService.approveOrder(id, userId)

    // If materials are available, automatically move to MRP_PENDING
    if (hasRequiredMaterials) {
      await this.moveToMrpPending(id, userId)
    } else {
      // Stay in APPROVED but warn about missing materials
      // In a real system, you might want to create a notification
      console.warn(`Order ${id} approved but missing materials:`, missingMaterials)
    }

    logger.info({ orderId: id, orderNumber: order.orderNumber, hasRequiredMaterials }, 'Sales order approved')
    return { order: await salesOrderService.getOrderById(id), hasRequiredMaterials, missingMaterials }
  },

  /**
   * Move order from APPROVED to MRP_PENDING (materials reserved)
   * @param id Sales order ID
   * @param userId User ID performing the action
   */
  async moveToMrpPending(id: string, userId?: string) {
    const order = await salesOrderService.getOrderById(id)
    
    if (order.status !== 'APPROVED') {
      throw new AppError(400, 'INVALID', 'Order must be approved to move to MRP pending')
    }

    // Reserve materials (in a real system, this would create stock reservations)
    // For now, we just update the status
    await salesOrderRepository.update(id, { 
      status: 'MRP_PENDING'
    })

    logger.info({ orderId: id, orderNumber: order.orderNumber }, 'Sales order moved to MRP pending')
    return await salesOrderService.getOrderById(id)
  },

  /**
   * Move order from MRP_PENDING to IN_PRODUCTION and create production job
   * @param id Sales order ID
   * @param userId User ID performing the action
   * @param productionInput Production job details
   */
  async startProduction(id: string, productionInput: any, userId?: string) {
    const order = await salesOrderService.getOrderById(id)
    
    if (order.status !== 'MRP_PENDING' && order.status !== 'APPROVED') {
      throw new AppError(400, 'INVALID', 'Order must be in MRP pending or approved status to start production')
    }

    // Check materials one more time before starting production
    const hasMaterials = await this.checkMaterialAvailability(order)
    if (!hasMaterials.available) {
      throw new AppError(400, 'INSUFFICIENT_MATERIALS', 'Insufficient materials to start production')
    }

    // Start transaction to ensure consistency
    return await prisma.$transaction(async (tx) => {
      // 1. Update sales order status to IN_PRODUCTION
      await tx.salesOrder.update({
        where: { id },
        data: { 
          status: 'IN_PRODUCTION',
          // Store production reference if needed
          // productionJobId will be set after job creation
        }
      })

      // 2. Create production job with sales order reference
      const jobData = {
        ...productionInput,
        customerName: order.customer?.name || '',
        // Link to sales order (we'll add this field to ProductionJob if needed)
        // For now, we'll rely on the productionJobId in SalesOrder
      }

      const productionJob = await productionService.createJob(jobData)
      
      // 3. Link production job to sales order
      await tx.salesOrder.update({
        where: { id },
        data: { 
          productionJobId: productionJob.id
        }
      })

      // 4. Issue materials to production (decrease stock)
      await this.issueMaterialsToProduction(tx, order, productionJob)

      logger.info({ 
        orderId: id, 
        orderNumber: order.orderNumber,
        productionJobId: productionJob.id,
        jobNumber: productionJob.jobNumber 
      }, 'Production started for sales order')

      return { 
        order: await salesOrderService.getOrderById(id), 
        productionJob 
      }
    })
  },

  /**
   * Complete production and move sales order to READY
   * @param productionJobId Production job ID
   * @param userId User ID performing the action
   */
  async completeProduction(productionJobId: string, userId?: string) {
    // Complete the production job
    const completedJob = await productionService.completeJob(productionJobId)
    
    // Find the sales order linked to this production job
    const order = await prisma.salesOrder.findFirst({
      where: { productionJobId }
    })
    
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'No sales order found for this production job')
    }

    // Update sales order status to READY
    await salesOrderRepository.update(order.id, { 
      status: 'READY'
    })

    logger.info({ 
      orderId: order.id, 
      orderNumber: order.orderNumber,
      productionJobId 
    }, 'Sales order marked as ready for pickup after production completion')

    return { 
      order: await salesOrderService.getOrderById(order.id), 
      productionJob: completedJob 
    }
  },

  /**
   * Mark sales order as picked up and generate invoice
   * @param id Sales order ID
   * @param coresReturned Number of cores returned by customer
   * @param userId User ID performing the action
   */
  async recordPickup(id: string, coresReturned = 0, userId?: string) {
    const order = await salesOrderService.getOrderById(id)
    
    if (order.status !== 'READY') {
      throw new AppError(400, 'INVALID', 'Order is not ready for pickup')
    }

    // Start transaction for pickup and invoicing
    return await prisma.$transaction(async (tx) => {
      // 1. Handle core returns if any
      if (coresReturned > 0) {
        await this.handleCoreReturn(tx, order, coresReturned, userId)
      }

      // 2. Generate invoice
      const packingBagsQuantity = Number(order.packingBagsQuantity) || 0
      const packingBagMaterial = await tx.material.findFirst({ where: { code: 'PBAG' } })
      let packingBagsUnitPrice = 0
      if (packingBagMaterial) {
        const priceList = await tx.priceList.findFirst({
          where: { materialId: packingBagMaterial.id },
          orderBy: { effectiveFrom: 'desc' }
        })
        packingBagsUnitPrice = priceList?.pricePerPack ? Number(priceList.pricePerPack) : 0
      }
      const packingBagsSubtotal = packingBagsQuantity * packingBagsUnitPrice
      
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: await this.getNextInvoiceNumber(),
          salesOrderId: order.id,
          customerId: order.customerId,
          quantityDelivered: order.quantityDelivered || order.quantityOrdered,
          unitPrice: order.unitPrice,
          subtotal: new Prisma.Decimal(String(Number(order.quantityDelivered || order.quantityOrdered) * Number(order.unitPrice))),
          vatAmount: new Prisma.Decimal('0'),
          totalAmount: new Prisma.Decimal('0'),
          depositApplied: order.depositPaid,
          coreCreditApplied: order.coreCreditApplied,
          previousPayments: order.balancePaid,
          balanceDue: new Prisma.Decimal('0'),
          coresReturned,
          packingBagsQuantity,
          packingBagsUnitPrice: new Prisma.Decimal(String(packingBagsUnitPrice)),
          packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotal)),
          packingBagsPaid: new Prisma.Decimal('0')
        }
      })

      // 3. Update invoice with proper calculations (using invoice service logic)
      const calculatedInvoice = await this.calculateInvoiceAmounts(invoice.id)
      
      // 4. Update sales order to PICKED_UP
      await tx.salesOrder.update({
        where: { id },
        data: { 
          status: 'PICKED_UP',
          completedAt: new Date()
        }
      })

      logger.info({ 
        orderId: id, 
        orderNumber: order.orderNumber,
        invoiceId: calculatedInvoice.id,
        coresReturned 
      }, 'Sales order picked up and invoiced')

      return { 
        order: await salesOrderService.getOrderById(id), 
        invoice: calculatedInvoice 
      }
    })
  },

  /**
   * Extract material requirements from sales order specs
   * This is a simplified implementation - in reality, you'd have a proper BOM
   */
  extractMaterialRequirements(specs: SpecsJson): Array<{ materialId: string; materialName?: string; required: number; available: number }> {
    const requirements: Array<{ materialId: string; materialName?: string; required: number; available: number }> = []
    
    // Example implementation - adjust based on your actual specs structure
    if (typeof specs === 'object' && specs !== null) {
      // Check for material in specs
      if (specs.material) {
        // Find material by name or code
        // This is simplified - you'd want to look up the actual material
        requirements.push({
          materialId: specs.material, // In reality, this would be a material ID lookup
          materialName: String(specs.material),
          required: Number(specs.quantity) || 1,
          available: 0 // We don't check availability here, just add to requirements
        })
      }
      
      // Check for core requirements
      if (specs.coresRequired) {
        requirements.push({
          materialId: 'core-material-id', // You'd need to get the actual core material ID
          materialName: 'Plastic Core',
          required: Number(specs.coresRequired),
          available: 0 // We don't check availability here, just add to requirements
        })
      }
    }
    
    return requirements
  },

  /**
   * Check if materials are available for production
   */
  async checkMaterialAvailability(order: any) {
    // This is a simplified check - in reality, you'd check all required materials
    // For now, we'll just check if we have any plain rolls available
    const plainRolls = await inventoryService.getAllMaterials()
    const hasPlainRolls = plainRolls.length > 0
    
    return {
      available: hasPlainRolls,
      details: hasPlainRolls 
        ? { plainRollsAvailable: plainRolls.length } 
        : { message: 'No plain rolls available' }
    }
  },

  /**
   * Issue materials to production (decrease stock)
   */
  async issueMaterialsToProduction(tx: any, order: any, productionJob: any) {
    // Issue cores for each printed roll
    const settings = await settingsService.getSettings()
    const coresPerRoll = 1 // One core per printed roll
    const totalCoresNeeded = productionJob.printedRolls.length * coresPerRoll
    
    // Find core material (you'd need to identify this properly)
    const coreMaterial = await prisma.material.findFirst({
      where: { name: { contains: 'core', mode: 'insensitive' } }
    })
    
    if (coreMaterial) {
      // Decrease core stock using inventory service
      await inventoryService.addStock(
        coreMaterial.id,
        -totalCoresNeeded // Negative because we're using cores
      )
    }
    
    // Issue other materials based on specs
    // This would be more complex in a real implementation
  },

  /**
   * Handle core return from customer at pickup
   */
  async handleCoreReturn(tx: any, order: any, coresReturned: number, userId?: string) {
    // Find core material
    const coreMaterial = await prisma.material.findFirst({
      where: { name: { contains: 'core', mode: 'insensitive' } }
    })
    
    if (coreMaterial) {
      // Increase core stock (returned cores) using inventory service
      await inventoryService.addStock(
        coreMaterial.id,
        coresReturned // Positive because we're receiving cores
      )
      
      // Credit customer's core balance
      const settings = await settingsService.getSettings()
      const coreValue = coresReturned * Number(settings.coreDepositValue || 150)
      
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          coreCreditBalance: {
            increment: new Prisma.Decimal(String(coreValue))
          }
        }
      })
    }
  },

  /**
   * Get next invoice number
   */
  async getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear()
    const lastInvoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `INV-${year}` } },
      orderBy: { invoiceNumber: 'desc' }
    })
    
    if (lastInvoice) {
      const lastNum = parseInt(lastInvoice.invoiceNumber.split('-')[2] || '0')
      return `INV-${year}-${String(lastNum + 1).padStart(4, '0')}`
    }
    return `INV-${year}-0001`
  },

  /**
   * Calculate invoice amounts (VAT, totals, etc.)
   */
  async calculateInvoiceAmounts(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    })
    
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice not found')
    }
    
    // Calculate roll subtotal
    const quantityDelivered = Number(invoice.quantityDelivered)
    const unitPrice = Number(invoice.unitPrice)
    const subtotal = quantityDelivered * unitPrice
    
    // Calculate packing bags subtotal
    const packingBagsQuantity = invoice.packingBagsQuantity || 0
    const packingBagsUnitPrice = Number(invoice.packingBagsUnitPrice)
    const packingBagsSubtotal = packingBagsQuantity * packingBagsUnitPrice
    
    // Get VAT rate
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const vatRate = settings?.vatRate ? Number(settings.vatRate) : 7.5
    const vatAmount = subtotal * (vatRate / 100)
    const totalAmount = subtotal + packingBagsSubtotal + vatAmount
    
    const balanceDue = totalAmount - 
      Number(invoice.depositApplied) - 
      Number(invoice.coreCreditApplied) - 
      Number(invoice.previousPayments) -
      Number(invoice.packingBagsPaid)
    
    // Update invoice with calculated values
    return await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: new Prisma.Decimal(String(subtotal)),
        packingBagsSubtotal: new Prisma.Decimal(String(packingBagsSubtotal)),
        vatAmount: new Prisma.Decimal(String(vatAmount)),
        totalAmount: new Prisma.Decimal(String(totalAmount)),
        balanceDue: new Prisma.Decimal(String(balanceDue))
      }
    })
  }
}