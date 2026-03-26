import { z } from 'zod'
import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { settingsService } from '../settings/service'
import { inventoryService } from '../inventory/service'
import { logger } from '../../logger'

export const productionJobSchema = z.object({
  salesOrderId: z.string().optional(),
  customerName: z.string().optional(),
  machine: z.string().min(1, 'Machine is required'),
  category: z.enum(['25microns', '27microns', '28microns', '30microns', 'Premium', 'SuPremium']).optional(),
  rollIds: z.array(z.string()).min(1, 'At least one parent roll is required'),
  printedRollWeights: z.array(z.number().positive()).min(1).max(200),
  wasteWeight: z.number().optional(),
  notes: z.string().optional()
})

export type ProductionJobInput = z.infer<typeof productionJobSchema>

export const productionService = {
  async getJobs(status?: string) {
    const jobs = await prisma.productionJob.findMany({
      where: status ? { status } : undefined,
      include: {
        salesOrder: true,
        printedRolls: {
          include: { roll: { include: { material: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    const jobsWithParentRolls = await Promise.all(jobs.map(async (job) => {
      if (job.parentRollIds && job.parentRollIds.length > 0) {
        const parentRolls = await prisma.roll.findMany({
          where: { id: { in: job.parentRollIds } }
        })
        return { ...job, parentRolls }
      }
      return job
    }))
    
    return jobsWithParentRolls
  },

  async getJobById(id: string) {
    const job = await prisma.productionJob.findUnique({
      where: { id },
      include: {
        salesOrder: true,
        printedRolls: {
          include: { roll: { include: { material: true } } }
        }
      }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    
    if (job.parentRollIds && job.parentRollIds.length > 0) {
      const parentRolls = await prisma.roll.findMany({
        where: { id: { in: job.parentRollIds } }
      })
      return { ...job, parentRolls }
    }
    
    return job
  },

  async createJob(input: ProductionJobInput) {
    try {
    const jobNumber = await this.generateJobNumber()
    logger.info({ jobNumber, input }, 'Creating production job')

    const parentRolls = await prisma.roll.findMany({
      where: {
        id: { in: input.rollIds },
        status: { in: ['AVAILABLE', 'IN_PRODUCTION'] }
      },
      include: { material: true }
    })

    if (parentRolls.length !== input.rollIds.length) {
      throw new AppError(400, 'INVALID_ROLLS', 'Some rolls are not available for production')
    }

    const material = parentRolls[0]?.material
    if (!material) {
      throw new AppError(400, 'INVALID_MATERIAL', 'Parent roll has no material assigned')
    }

    const newRolls = await prisma.$transaction(async (tx) => {
      const lastRoll = await tx.roll.findFirst({
        where: { rollNumber: { startsWith: 'PR' } },
        orderBy: { rollNumber: 'desc' }
      })
      let rollCounter = lastRoll ? parseInt(lastRoll.rollNumber.replace(/^\D+/g, '')) || 0 : 0
      
      const createdRolls = []
      
      for (const weight of input.printedRollWeights) {
        rollCounter++
        const newRoll = await tx.roll.create({
          data: {
            rollNumber: `PR${String(rollCounter).padStart(5, '0')}`,
            materialId: material.id,
            weight: weight,
            remainingWeight: weight,
            status: 'AVAILABLE',
            receivedDate: new Date()
          }
        })
        createdRolls.push(newRoll)
      }

      for (const parentRoll of parentRolls) {
        await tx.roll.update({
          where: { id: parentRoll.id },
          data: { status: 'IN_PRODUCTION' }
        })
      }

      return createdRolls
    })

    const job = await prisma.productionJob.create({
      data: {
        jobNumber,
        salesOrderId: input.salesOrderId,
        customerName: input.customerName,
        machine: input.machine,
        wasteWeight: input.wasteWeight ?? 0,
        notes: input.notes,
        parentRollIds: parentRolls.map(r => r.id),
        status: 'IN_PRODUCTION',
        startDate: new Date(),
        printedRolls: {
          create: newRolls.map((newRoll, idx) => ({
            rollId: newRoll.id,
            weightUsed: newRoll.weight,
            wasteWeight: idx === 0 ? (input.wasteWeight ?? 0) : 0,
            status: 'IN_STOCK'
          }))
        }
      },
      include: {
        salesOrder: true,
        printedRolls: {
          include: { roll: true }
        }
      }
    })

    return job
    } catch (error: any) {
      logger.error({ error, input }, 'Error in createJob')
      throw error
    }
  },

  async addPrintedRolls(jobId: string, weights: number[]) {
    const job = await prisma.productionJob.findUnique({
      where: { id: jobId },
      include: { printedRolls: { include: { roll: true } } }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    if (job.status === 'COMPLETED') throw new AppError(400, 'INVALID_OPERATION', 'Job already completed')

    const firstRollId = job.printedRolls[0]?.rollId
    if (!firstRollId) throw new AppError(400, 'INVALID', 'No roll found for this job')

    await prisma.printedRoll.createMany({
      data: weights.map(weight => ({
        productionJobId: jobId,
        rollId: firstRollId,
        weightUsed: weight,
        wasteWeight: 0
      }))
    })

    return this.getJobById(jobId)
  },

  async completeJob(jobId: string) {
    const job = await prisma.productionJob.findUnique({
      where: { id: jobId },
      include: {
        printedRolls: { 
          include: { roll: true },
          orderBy: { id: 'asc' }
        }
      }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    if (job.status === 'COMPLETED') throw new AppError(400, 'INVALID_OPERATION', 'Job already completed')

    let parentRollIds = job.parentRollIds || []

    if (parentRollIds.length === 0 && job.printedRolls.length > 0) {
      const firstRoll = job.printedRolls[0]?.roll
      if (firstRoll) {
        const similarRolls = await prisma.roll.findMany({
          where: {
            materialId: firstRoll.materialId,
            status: { in: ['AVAILABLE', 'IN_PRODUCTION'] }
          },
          orderBy: { createdAt: 'asc' },
          take: 1
        })
        if (similarRolls.length > 0) {
          parentRollIds = [similarRolls[0].id]
        }
      }
    }

    const comboPrintedRollIds: string[] = []
    const parentRollUpdates: { id: string; newRemainingWeight: number; newStatus: string }[] = []
    const printedRollMapping: Record<string, string> = {}

    if (parentRollIds.length > 0) {
      const parentRolls = await prisma.roll.findMany({
        where: { id: { in: parentRollIds } },
        orderBy: { createdAt: 'asc' }
      })

      let parentRollIndex = 0
      let remainingInCurrentRoll = Number(parentRolls[0]?.remainingWeight || 0)

      for (const printedRoll of job.printedRolls) {
        const weightNeeded = Number(printedRoll.weightUsed)
        let isCombo = false

        printedRollMapping[printedRoll.id] = parentRolls[parentRollIndex]?.id || ''

        while (weightNeeded > remainingInCurrentRoll && parentRollIndex < parentRolls.length - 1) {
          isCombo = true
          remainingInCurrentRoll = 0
          parentRollIndex++
          remainingInCurrentRoll = Number(parentRolls[parentRollIndex]?.remainingWeight || 0)
        }

        if (remainingInCurrentRoll > 0) {
          remainingInCurrentRoll -= weightNeeded
        }

        if (isCombo) {
          comboPrintedRollIds.push(printedRoll.id)
        }
      }

      for (let i = 0; i < parentRolls.length; i++) {
        const roll = parentRolls[i]
        let newRemainingWeight: number

        if (i < parentRollIndex) {
          newRemainingWeight = 0
        } else if (i === parentRollIndex) {
          newRemainingWeight = Math.max(0, remainingInCurrentRoll)
        } else {
          newRemainingWeight = Number(roll.remainingWeight)
        }

        const newStatus = newRemainingWeight < 2 ? 'CONSUMED' : 'IN_PRODUCTION'
        parentRollUpdates.push({ id: roll.id, newRemainingWeight, newStatus })
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const update of parentRollUpdates) {
        await tx.roll.update({
          where: { id: update.id },
          data: {
            remainingWeight: update.newRemainingWeight,
            status: update.newStatus as any
          }
        })
      }

      if (comboPrintedRollIds.length > 0) {
        await tx.printedRoll.updateMany({
          where: { id: { in: comboPrintedRollIds } },
          data: { isCombination: true }
        })
      }

      await tx.productionJob.update({
        where: { id: jobId },
        data: { 
          status: 'COMPLETED', 
          endDate: new Date(),
          printedRollMapping: Object.keys(printedRollMapping).length > 0 ? JSON.parse(JSON.stringify(printedRollMapping)) : undefined
        }
      })
    })

    const consumedRollsCount = parentRollUpdates.filter(u => u.newStatus === 'CONSUMED').length
    if (consumedRollsCount > 0) {
      const { inventoryService } = require('../inventory/service')
      await inventoryService.recordCoreChange(
        consumedRollsCount,
        'CORE_RECOVERY',
        job.jobNumber
      )
    }

    const totalPrintedWeight = job.printedRolls.reduce((sum, pr) => sum + Number(pr.weightUsed), 0)

    if (totalPrintedWeight > 0 && job.customerName) {
      const customer = await prisma.customer.findFirst({
        where: { name: { contains: job.customerName, mode: 'insensitive' } }
      })

      if (customer) {
        const rates = await settingsService.getConsumptionRates()
        const customerColors = customer.colors || []
        const colorCount = customerColors.length || 1

        const inkNeeded = totalPrintedWeight * rates.inkConsumptionRate
        const ipaNeeded = totalPrintedWeight * rates.ipaConsumptionRate
        const butanolNeeded = totalPrintedWeight * rates.butanolConsumptionRate

        const materials = await prisma.material.findMany({
          where: { category: 'INK_SOLVENTS' }
        })

        const inkColorMap: Record<string, string> = {
          'Red': 'Red-Ink',
          'Yellow': 'Yellow-Ink',
          'White': 'White-Ink',
          'RoyalBlue': 'RoyalBlue-Ink',
          'VioletBlue': 'VioletBlue-Ink',
          'SkyBlue': 'SkyBlue-Ink'
        }

        for (const mat of materials) {
          if (mat.subCategory === 'IPA' && ipaNeeded > 0) {
            await inventoryService.addStock(mat.id, -ipaNeeded, `Job ${job.jobNumber} completed`, jobId)
          }
          if (mat.subCategory === 'Butanol' && butanolNeeded > 0) {
            await inventoryService.addStock(mat.id, -butanolNeeded, `Job ${job.jobNumber} completed`, jobId)
          }
          
          if (customerColors.length > 0 && inkNeeded > 0) {
            const customerColorSubCategories = customerColors.map(c => inkColorMap[c]).filter(Boolean)
            if (customerColorSubCategories.includes(mat.subCategory || '')) {
              const inkPerColor = inkNeeded / colorCount
              await inventoryService.addStock(mat.id, -inkPerColor, `Job ${job.jobNumber} completed`, jobId)
            }
          }
        }
      }
    }

    // Deduct cores on production completion
    const totalPrintedRolls = job.printedRolls.length
    if (totalPrintedRolls > 0) {
      await inventoryService.recordCoreChange(
        -totalPrintedRolls,
        'PRODUCTION_OUT',
        job.jobNumber
      )
    }

    // Update sales order to READY
    if (job.salesOrderId) {
      const actualWeight = job.printedRolls.reduce((sum, pr) => sum + Number(pr.weightUsed || 0), 0)
      const salesOrder = await prisma.salesOrder.findUnique({
        where: { id: job.salesOrderId }
      })
      if (salesOrder) {
        const unitPrice = Number(salesOrder.unitPrice)
        const totalAmount = actualWeight * unitPrice
        
        await prisma.salesOrder.update({
          where: { id: job.salesOrderId },
          data: {
            status: 'READY',
            quantityProduced: actualWeight,
            totalAmount
          }
        })
        logger.info({ salesOrderId: job.salesOrderId, actualWeight, totalAmount }, 'Sales order updated to READY after production completion')
      }
    }

    return prisma.productionJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        endDate: new Date()
      },
      include: {
        printedRolls: {
          include: { roll: true }
        }
      }
    })
  },

  async updateJob(jobId: string, input: Partial<ProductionJobInput>) {
    const job = await prisma.productionJob.findUnique({
      where: { id: jobId },
      include: {
        printedRolls: {
          include: {
            roll: {
              include: { material: true }
            }
          }
        }
      }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    if (job.status === 'COMPLETED') throw new AppError(400, 'INVALID_OPERATION', 'Cannot edit completed job')
  
    const updates: any = {}
    if (input.customerName !== undefined) updates.customerName = input.customerName
    if (input.machine !== undefined) updates.machine = input.machine
    if (input.wasteWeight !== undefined) updates.wasteWeight = input.wasteWeight
    if (input.notes !== undefined) updates.notes = input.notes
  
    if (input.printedRollWeights && input.printedRollWeights.length > 0) {
      const existingWeights = job.printedRolls.map(pr => Number(pr.weightUsed))
      const weightsChanged = JSON.stringify(existingWeights) !== JSON.stringify(input.printedRollWeights)
      
      if (weightsChanged) {
        await prisma.printedRoll.deleteMany({ where: { productionJobId: jobId } })
        
        if (job.printedRolls.length === 0) {
          throw new AppError(400, 'INVALID', 'Job has no printed rolls')
        }
        const material = job.printedRolls[0]?.roll?.material
        if (!material) {
          throw new AppError(400, 'INVALID_MATERIAL', 'No material found for this job')
        }
        
        const lastRoll = await prisma.roll.findFirst({
          where: { rollNumber: { startsWith: 'PR' } },
          orderBy: { rollNumber: 'desc' }
        })
        let rollCounter = lastRoll ? parseInt(lastRoll.rollNumber.replace(/^\D+/g, '')) || 0 : 0
  
        const newRolls = []
        for (const weight of input.printedRollWeights) {
          rollCounter++
          const newRoll = await prisma.roll.create({
            data: {
              rollNumber: `PR${String(rollCounter).padStart(5, '0')}`,
              materialId: material.id,
              weight: weight,
              remainingWeight: weight,
              status: 'AVAILABLE',
              receivedDate: new Date()
            }
          })
          newRolls.push(newRoll)
        }
        
        await prisma.printedRoll.createMany({
          data: newRolls.map((newRoll, idx) => ({
            productionJobId: jobId,
            rollId: newRoll.id,
            weightUsed: newRoll.weight,
            wasteWeight: idx === 0 ? (input.wasteWeight ?? 0) : 0
          }))
        })
      }
    }
  
    return prisma.productionJob.update({
      where: { id: jobId },
      data: updates,
      include: {
        printedRolls: {
          include: {
            roll: {
              include: { material: true }
            }
          }
        }
      }
    })
  },

  async deleteJob(jobId: string) {
    const job = await prisma.productionJob.findUnique({
      where: { id: jobId }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    if (job.status === 'COMPLETED') throw new AppError(400, 'INVALID_OPERATION', 'Cannot delete completed job')

    // Get printed rolls before deletion to restore inventory
    const printedRolls = await prisma.printedRoll.findMany({
      where: { productionJobId: jobId }
    })
    const numPrintedRolls = printedRolls.length

    return prisma.$transaction(async (tx) => {
      // Restore parent rolls to AVAILABLE
      if (job.parentRollIds && job.parentRollIds.length > 0) {
        await tx.roll.updateMany({
          where: { id: { in: job.parentRollIds } },
          data: { status: 'AVAILABLE' }
        })
      }

      // Restore cores if production had started
      if (numPrintedRolls > 0) {
        await inventoryService.recordCoreChange(
          numPrintedRolls,
          'CORE_RECOVERY',
          `Job ${job.jobNumber} deleted`
        )
      }

      // Delete printed rolls
      await tx.printedRoll.deleteMany({ where: { productionJobId: jobId } })

      // Delete production job
      await tx.productionJob.delete({ where: { id: jobId } })

      // Sync back to sales order
      if (job.salesOrderId) {
        await tx.salesOrder.update({
          where: { id: job.salesOrderId },
          data: {
            status: 'APPROVED',
            productionJobId: null
          }
        })
        logger.info({ salesOrderId: job.salesOrderId, jobId }, 'Sales order reverted after production deletion')
      }

      return { success: true }
    })
  },

  async getAvailableRolls(category?: string) {
    return prisma.roll.findMany({
      where: {
        status: { in: ['AVAILABLE', 'IN_PRODUCTION'] },
        material: { category: 'PLAIN_ROLLS' },
        remainingWeight: { gte: 2 },
        rollNumber: { not: { startsWith: 'PR' } },
        ...(category ? { material: { subCategory: category } } : {})
      },
      include: { material: true },
      orderBy: { createdAt: 'asc' }
    })
  },

  async getPrintedRolls(status?: string) {
    const jobs = await prisma.productionJob.findMany({
      where: { status: 'COMPLETED' },
      include: {
        printedRolls: {
          include: {
            roll: {
              include: { material: true }
            },
            customer: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const allParentRollIds = [...new Set(jobs.flatMap(j => j.parentRollIds || []))]
    const parentRollsMap = new Map<string, { rollNumber: string; weight: number }>()
    
    if (allParentRollIds.length > 0) {
      const parentRolls = await prisma.roll.findMany({
        where: { id: { in: allParentRollIds } }
      })
      parentRolls.forEach(r => parentRollsMap.set(r.id, { rollNumber: r.rollNumber, weight: Number(r.weight) }))
    }

    const printedRolls = []
    for (const job of jobs) {
      const mapping = (job as any).printedRollMapping as Record<string, string> || {}
      
      for (const pr of job.printedRolls) {
        if (status && pr.status !== status) continue
        
        let parentRollsDisplay: string[] = []
        
        if (pr.isCombination) {
          parentRollsDisplay = (job.parentRollIds || [])
            .map(id => {
              const pr = parentRollsMap.get(id)
              return pr ? `${pr.rollNumber} (${pr.weight}kg)` : null
            })
            .filter(Boolean) as string[]
        } else if (mapping[pr.id]) {
          const parentRoll = parentRollsMap.get(mapping[pr.id])
          if (parentRoll) {
            parentRollsDisplay = [`${parentRoll.rollNumber} (${parentRoll.weight}kg)`]
          }
        } else {
          parentRollsDisplay = (job.parentRollIds || [])
            .map(id => {
              const pr = parentRollsMap.get(id)
              return pr ? `${pr.rollNumber} (${pr.weight}kg)` : null
            })
            .filter(Boolean) as string[]
        }
        
        printedRolls.push({
          id: pr.id,
          rollNumber: pr.roll?.rollNumber || 'N/A',
          weight: pr.weightUsed,
          material: pr.roll?.material?.subCategory || 'N/A',
          customerName: job.customerName || pr.customer?.name || 'N/A',
          jobNumber: job.jobNumber,
          status: pr.status,
          isCombination: pr.isCombination,
          parentRolls: parentRollsDisplay,
          pickedUpAt: pr.pickedUpAt,
          createdAt: pr.createdAt
        })
      }
    }
    return printedRolls
  },

  async generateJobNumber() {
    const year = new Date().getFullYear()
    const lastJob = await prisma.productionJob.findFirst({
      where: { jobNumber: { startsWith: `PRD-${year}` } },
      orderBy: { jobNumber: 'desc' }
    })

    if (lastJob) {
      const lastNum = parseInt(lastJob.jobNumber.split('-')[2] || '0')
      return `PRD-${year}-${String(lastNum + 1).padStart(4, '0')}`
    }
    return `PRD-${year}-0001`
  },

  async getRollTypes() {
    const rolls = await prisma.roll.findMany({
      include: { material: true }
    })
    
    const typeMap = new Map<string, any>()
    for (const r of rolls) {
      const key = `${r.materialId}-${r.width}-${r.length}-${r.coreSize}`
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          id: r.id,
          materialName: r.material.name,
          materialCode: r.material.code,
          width: r.width ? Number(r.width) : null,
          length: r.length ? Number(r.length) : null,
          coreSize: r.coreSize
        })
      }
    }
    return Array.from(typeMap.values())
  }
}
