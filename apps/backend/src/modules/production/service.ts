import { z } from 'zod'
import { prisma } from '../../database'
import { AppError } from '../../middleware/errorHandler'
import { settingsService } from '../settings/service'
import { inventoryService } from '../inventory/service'
import { logger } from '../../logger'

export const productionJobSchema = z.object({
  customerName: z.string().optional(),
  machine: z.string().min(1, 'Machine is required'),
  category: z.enum(['25microns', '27microns', '28microns', '30microns', 'Premium', 'SuPremium']).optional(),
  rollIds: z.array(z.string()).min(1, 'At least one parent roll is required'),
  printedRollWeights: z.array(z.number().positive()).min(1).max(35),
  wasteWeight: z.number().optional(),
  notes: z.string().optional()
})

export type ProductionJobInput = z.infer<typeof productionJobSchema>

export const productionService = {
  async getJobs(status?: string) {
    const jobs = await prisma.productionJob.findMany({
      where: status ? { status } : undefined,
      include: {
        printedRolls: {
          include: { roll: { include: { material: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    // Fetch parent roll details for each job
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
        printedRolls: {
          include: { roll: { include: { material: true } } }
        }
      }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    
    // Fetch parent roll details
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

    logger.info({ parentRollsFound: parentRolls.length, inputRollIds: input.rollIds }, 'Parent rolls query')

    if (parentRolls.length !== input.rollIds.length) {
      throw new AppError(400, 'INVALID_ROLLS', 'Some rolls are not available for production')
    }

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const coreWeight = Number(settings?.coreWeight || 0.7)
    
    logger.info({ parentRolls: parentRolls.map(r => ({ id: r.id, weight: r.weight, remainingWeight: r.remainingWeight })) }, 'Parent rolls')

    const totalParentWeight = parentRolls.reduce((sum, r) => sum + Number(r.remainingWeight), 0)
    const totalPrintedWeight = input.printedRollWeights.reduce((sum, w) => sum + w, 0)
    const numPrintedRolls = input.printedRollWeights.length

    logger.info({ totalParentWeight, totalPrintedWeight }, 'Weight check')

    const calculatedWaste = input.wasteWeight ?? 0

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

    logger.info({ newRollsCount: newRolls.length }, 'Transaction completed')

    return prisma.productionJob.create({
      data: {
        jobNumber,
        customerName: input.customerName,
        machine: input.machine,
        wasteWeight: input.wasteWeight ?? calculatedWaste,
        notes: input.notes,
        parentRollIds: parentRolls.map(r => r.id),
        status: 'IN_PRODUCTION',
        startDate: new Date(),
        printedRolls: {
          create: newRolls.map((newRoll, idx) => ({
            rollId: newRoll.id,
            weightUsed: newRoll.weight,
            wasteWeight: idx === 0 ? (input.wasteWeight ?? calculatedWaste) : 0,
            status: 'IN_STOCK'
          }))
        }
      },
      include: {
        printedRolls: {
          include: { roll: true }
        }
      }
    })
    } catch (error: any) {
      console.error('=== CREATE JOB ERROR ===')
      console.error(error.stack || error)
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

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const coreWeight = Number(settings?.coreWeight || 0.7)

    const newPrintedRolls = await prisma.printedRoll.createManyAndReturn({
      data: weights.map(weight => ({
        productionJobId: jobId,
        rollId: job.printedRolls[0]?.rollId || '',
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

    logger.info({ jobId, job: { parentRollIds: job.parentRollIds, printedRollsCount: job.printedRolls.length } }, 'Completing production job')

    let parentRollIds = job.parentRollIds || []

    // If no parentRollIds stored (old job), try to infer from printed rolls
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

    if (parentRollIds.length === 0) {
      logger.warn({ jobId }, 'No parent rolls found to update')
    }

    // Calculate which printed rolls are combinations (spanning multiple parent rolls)
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

        // Track which parent roll this printed roll starts from
        printedRollMapping[printedRoll.id] = parentRolls[parentRollIndex]?.id || ''

        while (weightNeeded > remainingInCurrentRoll && parentRollIndex < parentRolls.length - 1) {
          // This printed roll spans to the next parent roll
          isCombo = true
          remainingInCurrentRoll = 0
          
          // Move to next parent roll
          parentRollIndex++
          remainingInCurrentRoll = Number(parentRolls[parentRollIndex]?.remainingWeight || 0)
        }

        if (remainingInCurrentRoll > 0) {
          remainingInCurrentRoll -= weightNeeded
        }

        if (isCombo) {
          comboPrintedRollIds.push(printedRoll.id)
        }

        logger.info({
          printedRollId: printedRoll.id,
          weightNeeded,
          isCombo,
          parentRollIndex,
          parentRollId: parentRolls[parentRollIndex]?.id
        }, 'Printed roll consumption tracking')
      }

      // Calculate final parent roll updates
      for (let i = 0; i < parentRolls.length; i++) {
        const roll = parentRolls[i]
        let newRemainingWeight: number

        if (i < parentRollIndex) {
          // Already fully consumed
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
      // Update parent rolls
      for (const update of parentRollUpdates) {
        await tx.roll.update({
          where: { id: update.id },
          data: {
            remainingWeight: update.newRemainingWeight,
            status: update.newStatus as any
          }
        })
      }

      // Mark combo printed rolls
      if (comboPrintedRollIds.length > 0) {
        await tx.printedRoll.updateMany({
          where: { id: { in: comboPrintedRollIds } },
          data: { isCombination: true }
        })
      }

      // Update job status with mapping
      console.log('SAVING MAPPING:', JSON.stringify(printedRollMapping))
      await tx.productionJob.update({
        where: { id: jobId },
        data: { 
          status: 'COMPLETED', 
          endDate: new Date(),
          printedRollMapping: Object.keys(printedRollMapping).length > 0 ? JSON.parse(JSON.stringify(printedRollMapping)) : undefined
        }
      })
    })

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

        logger.info({ jobId, inkNeeded, ipaNeeded, butanolNeeded, colorCount, customerColors: customer.colors }, 'Deducted ink/solvents for job')
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
      include: { printedRolls: { include: { roll: true } } }
    })
    if (!job) throw new AppError(404, 'NOT_FOUND', 'Production job not found')
    if (job.status === 'COMPLETED') throw new AppError(400, 'INVALID_OPERATION', 'Cannot edit completed job')

    const updates: any = {}
    if (input.customerName !== undefined) updates.customerName = input.customerName
    if (input.machine !== undefined) updates.machine = input.machine
    if (input.wasteWeight !== undefined) updates.wasteWeight = input.wasteWeight
    if (input.notes !== undefined) updates.notes = input.notes

    // Only update printed rolls if explicitly provided and different
    if (input.printedRollWeights && input.printedRollWeights.length > 0) {
      // Check if weights actually changed
      const existingWeights = job.printedRolls.map(pr => Number(pr.weightUsed))
      const weightsChanged = JSON.stringify(existingWeights) !== JSON.stringify(input.printedRollWeights)
      
      if (weightsChanged) {
        // Delete existing printed rolls
        await prisma.printedRoll.deleteMany({ where: { productionJobId: jobId } })
        
        // Get material from existing printed rolls or parent rolls
        let material = job.printedRolls[0]?.roll?.material
        if (!material) {
          // Try to get from parent rolls
          if (job.parentRollIds && job.parentRollIds.length > 0) {
            const parentRoll = await prisma.roll.findFirst({ where: { id: job.parentRollIds[0] }, include: { material: true } })
            material = parentRoll?.material
          }
        }
        
        if (!material) throw new AppError(400, 'INVALID_MATERIAL', 'No material found for this job')
        
        const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
        const coreWeight = Number(settings?.coreWeight || 0.7)
        
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
          include: { roll: true }
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

    await prisma.printedRoll.deleteMany({ where: { productionJobId: jobId } })
    await prisma.productionJob.delete({ where: { id: jobId } })

    return { success: true }
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
        
        // Get parent roll info for this printed roll
        let parentRollsDisplay: string[] = []
        
        if (pr.isCombination) {
          // Combo roll - show all parent rolls
          parentRollsDisplay = (job.parentRollIds || [])
            .map(id => {
              const pr = parentRollsMap.get(id)
              return pr ? `${pr.rollNumber} (${pr.weight}kg)` : null
            })
            .filter(Boolean) as string[]
        } else if (mapping[pr.id]) {
          // Single roll with mapping - show only the parent roll it came from
          const parentRoll = parentRollsMap.get(mapping[pr.id])
          if (parentRoll) {
            parentRollsDisplay = [`${parentRoll.rollNumber} (${parentRoll.weight}kg)`]
          }
        } else {
          // Fallback for old data without mapping
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
