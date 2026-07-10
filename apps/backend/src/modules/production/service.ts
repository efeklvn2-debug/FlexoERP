import { z } from 'zod'
import { prisma } from '../../database'
import { Prisma } from '@prisma/client'
import { AppError } from '../../middleware/errorHandler'
import { settingsService } from '../settings/service'
import { inventoryService } from '../inventory/service'
import { financeService } from '../finance/service'
import { logger } from '../../logger'
import { dateFromInput } from '../../utils/dates'

export const productionJobSchema = z.object({
  salesOrderId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  machine: z.string().min(1, 'Machine is required'),
  category: z.enum(['25microns', '27microns', '28microns', '30microns', 'Premium', 'SuPremium']).optional(),
  materialOverride: z.string().optional(),
  rollIds: z.array(z.string()).min(1, 'At least one parent roll is required'),
  printedRollWeights: z.array(z.number().positive()).min(1).max(200),
  wasteWeight: z.number().optional(),
  rollWaste: z.record(z.string(), z.number().min(0)).optional(),
  rollConsumption: z.record(z.string(), z.number().min(0)).optional(),
  notes: z.string().optional(),
  date: z.string().optional()
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
      orderBy: { startDate: 'desc' }
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

    const material = input.materialOverride
      ? await prisma.material.findFirst({
          where: { category: 'PLAIN_ROLLS', subCategory: input.materialOverride }
        }) || parentRolls[0]?.material
      : parentRolls[0]?.material
    if (!material) {
      throw new AppError(400, 'INVALID_MATERIAL', 'Parent roll has no material assigned')
    }

    const newRolls = await (async function createRollsWithRetry(maxRetries = 3): Promise<any[]> {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await prisma.$transaction(async (tx) => {
            const lastRoll = await tx.roll.findFirst({
              where: { rollNumber: { startsWith: 'PR' } },
              orderBy: { rollNumber: 'desc' }
            })
            let rollCounter = lastRoll ? parseInt(lastRoll.rollNumber.replace(/^\D+/g, '')) || 0 : 0

            const createdRolls = []

            const primaryParentId = parentRolls.length === 1 ? parentRolls[0].id : null

            for (const weight of input.printedRollWeights) {
              rollCounter++
              const newRoll = await tx.roll.create({
                data: {
                  rollNumber: `PR${String(rollCounter).padStart(5, '0')}`,
                  materialId: material.id,
                  weight: weight,
                  remainingWeight: weight,
                  status: 'AVAILABLE',
                  receivedDate: dateFromInput(input.date),
                  parentRollId: primaryParentId
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
        } catch (error: any) {
          if (error?.code === 'P2002' && attempt < maxRetries) {
            logger.warn({ attempt, maxRetries }, 'Roll number collision, retrying...')
            continue
          }
          throw error
        }
      }
      throw new AppError(500, 'ROLL_CREATION_FAILED', 'Failed to create rolls after multiple attempts')
    })()

    const job = await prisma.productionJob.create({
      data: {
        jobNumber,
        salesOrderId: input.salesOrderId,
        customerId: input.customerId,
        customerName: input.customerName,
        machine: input.machine,
        materialOverride: input.materialOverride,
        wasteWeight: input.wasteWeight ?? 0,
        rollWaste: input.rollWaste ?? {},
        rollConsumption: input.rollConsumption ?? {},
        notes: input.notes,
        parentRollIds: input.rollIds,
        status: 'IN_PRODUCTION',
        startDate: dateFromInput(input.date),
        printedRolls: {
          create: newRolls.map((newRoll) => ({
            rollId: newRoll.id,
            weightUsed: newRoll.weight,
            wasteWeight: 0,
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

  async completeJob(jobId: string, date?: string) {
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
    const printedRollMapping: Record<string, Record<string, number>> = {}

    const coreWeight = await settingsService.getConsumptionRates().then(r => r.coreWeight)

    if (parentRollIds.length > 0) {
      const fetchedParentRolls = await prisma.roll.findMany({
        where: { id: { in: parentRollIds } }
      })
      const parentRollsMap = new Map(fetchedParentRolls.map(r => [r.id, r]))
      const parentRolls = parentRollIds.map(id => parentRollsMap.get(id)).filter(Boolean) as typeof fetchedParentRolls

      const rollWasteMap: Record<string, number> = (job.rollWaste as Record<string, number>) ?? {}
      const rollConsumption: Record<string, number> = (job.rollConsumption as Record<string, number>) ?? {}
      const effectiveCapacities = parentRolls.map(r => {
        const toleranceCapacity = Number(r.remainingWeight) + Number(r.weight) * 0.10
        return Math.max(0, toleranceCapacity - (rollWasteMap[r.id] ?? 0))
      })

      let parentRollIndex = 0
      let remainingInCurrentRoll = effectiveCapacities[0] ?? 0

      for (const [pi, printedRoll] of job.printedRolls.entries()) {
        let weightNeeded = Math.max(0, Number(printedRoll.weightUsed) - coreWeight)
        let isCombo = false
        const contributions: Record<string, number> = {}

        while (weightNeeded > 0 && parentRollIndex < parentRolls.length) {
          const currentRoll = parentRolls[parentRollIndex]

          let maxFromThisRoll = remainingInCurrentRoll
          if (pi === 0) {
            const consumption = rollConsumption[currentRoll.id]
            if (consumption !== undefined) {
              const netConsumption = Math.max(0, consumption - coreWeight)
              const alreadyTaken = contributions[currentRoll.id] || 0
              maxFromThisRoll = Math.min(maxFromThisRoll, Math.max(0, netConsumption - alreadyTaken))
              if (maxFromThisRoll <= 0) {
                parentRollIndex++
                remainingInCurrentRoll = effectiveCapacities[parentRollIndex] ?? 0
                continue
              }
            }
          }

          if (weightNeeded > maxFromThisRoll && parentRollIndex < parentRolls.length - 1) {
            isCombo = true
            contributions[currentRoll.id] = (contributions[currentRoll.id] || 0) + maxFromThisRoll
            weightNeeded -= maxFromThisRoll
            remainingInCurrentRoll -= maxFromThisRoll
            parentRollIndex++
            remainingInCurrentRoll = effectiveCapacities[parentRollIndex] ?? 0
          } else {
            contributions[currentRoll.id] = (contributions[currentRoll.id] || 0) + weightNeeded
            remainingInCurrentRoll -= weightNeeded
            weightNeeded = 0
          }
        }

        printedRollMapping[printedRoll.id] = contributions

        if (isCombo || Object.keys(contributions).length > 1) {
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
          newRemainingWeight = effectiveCapacities[i]
        }

        const newStatus = newRemainingWeight < 0.1 ? 'CONSUMED' : 'AVAILABLE'
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

      // Set parentRollId on each printed roll based on printedRollMapping
      for (const pr of job.printedRolls) {
        const contributions = printedRollMapping[pr.id]
        if (contributions) {
          const parentIds = Object.keys(contributions)
          if (parentIds.length === 1) {
            await tx.roll.update({
              where: { id: pr.rollId },
              data: { parentRollId: parentIds[0] }
            })
          }
        }
      }

      // Update printed roll createdAt to reflect the backdated completion date
      await tx.printedRoll.updateMany({
        where: { productionJobId: jobId },
        data: { createdAt: dateFromInput(date) }
      })

      await tx.productionJob.update({
        where: { id: jobId },
        data: { 
          status: 'COMPLETED', 
          endDate: dateFromInput(date),
          printedRollMapping: Object.keys(printedRollMapping).length > 0 ? JSON.parse(JSON.stringify(printedRollMapping)) : undefined
        }
      })

      const consumedRollsCount = parentRollUpdates.filter(u => u.newStatus === 'CONSUMED').length
      if (consumedRollsCount > 0) {
        await inventoryService.recordCoreChange(
          consumedRollsCount,
          'CORE_RECOVERY',
          job.jobNumber,
          undefined,
          tx
        )
      }

      const totalPrintedWeight = job.printedRolls.reduce((sum, pr) => sum + Math.max(0, Number(pr.weightUsed) - coreWeight), 0)

      if (totalPrintedWeight > 0 && job.customerName) {
        const customer = await tx.customer.findFirst({
          where: { name: { contains: job.customerName, mode: 'insensitive' } }
        })

        if (customer) {
          const rates = await settingsService.getConsumptionRates()
          const customerColors = customer.colors || []

          const inkNeeded = totalPrintedWeight * rates.inkConsumptionRate
          const ipaNeeded = totalPrintedWeight * rates.ipaConsumptionRate
          const butanolNeeded = totalPrintedWeight * rates.butanolConsumptionRate

          const materials = await tx.material.findMany({
            where: { category: 'INK_SOLVENTS', isActive: true }
          })

          const inkColorRows = await tx.inkColor.findMany({ where: { isActive: true } })
          const inkColorMap = Object.fromEntries(inkColorRows.map(ic => [ic.name, ic.mapping]))

          const materialsSubCategories = materials.map(m => m.subCategory).filter(Boolean) as string[]
          const mappedColorSubCategories = customerColors.map(c => {
            return inkColorMap[c] || materialsSubCategories.find(sc => sc.toLowerCase() === c.toLowerCase()) || null
          }).filter(Boolean) as string[]

          const mappedColorCount = mappedColorSubCategories.length || 1

          // Build deduction list
          const deductions: { materialId: string; name: string; needed: number }[] = []
          for (const mat of materials) {
            if (mat.subCategory === 'IPA' && ipaNeeded > 0) {
              deductions.push({ materialId: mat.id, name: mat.name, needed: ipaNeeded })
            }
            if (mat.subCategory === 'Butanol' && butanolNeeded > 0) {
              deductions.push({ materialId: mat.id, name: mat.name, needed: butanolNeeded })
            }
            if (mappedColorCount > 0 && inkNeeded > 0) {
              if (mappedColorSubCategories.includes(mat.subCategory || '')) {
                deductions.push({ materialId: mat.id, name: mat.name, needed: inkNeeded / mappedColorCount })
              }
            }
          }

          // Validate stock sufficiency before deducting
          if (deductions.length > 0) {
            const stockRecords = await tx.stock.findMany({
              where: { materialId: { in: deductions.map(d => d.materialId) }, location: 'MAIN' }
            })
            const stockMap = new Map(stockRecords.map(s => [s.materialId, s.quantity]))
            const shortages: string[] = []
            for (const d of deductions) {
              const available = stockMap.get(d.materialId) ?? 0
              if (available < d.needed) {
                shortages.push(`${d.name}: need ${Number(d.needed).toFixed(1)}, have ${available}`)
              }
            }
            if (shortages.length > 0) {
              throw new AppError(400, 'INSUFFICIENT_STOCK', `Cannot complete job ${job.jobNumber} — insufficient stock:\n${shortages.join('\n')}`)
            }
          }

          // Execute deductions
          for (const mat of materials) {
            if (mat.subCategory === 'IPA' && ipaNeeded > 0) {
              await inventoryService.addStock(mat.id, -ipaNeeded, `Job ${job.jobNumber} completed`, jobId, undefined, tx)
            }
            if (mat.subCategory === 'Butanol' && butanolNeeded > 0) {
              await inventoryService.addStock(mat.id, -butanolNeeded, `Job ${job.jobNumber} completed`, jobId, undefined, tx)
            }
            if (mappedColorCount > 0 && inkNeeded > 0) {
              if (mappedColorSubCategories.includes(mat.subCategory || '')) {
                await inventoryService.addStock(mat.id, -(inkNeeded / mappedColorCount), `Job ${job.jobNumber} completed`, jobId, undefined, tx)
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
          job.jobNumber,
          undefined,
          tx
        )
      }

      // Update sales order to READY
      if (job.salesOrderId) {
        const actualWeight = job.printedRolls.reduce((sum, pr) => sum + Number(pr.weightUsed || 0), 0)
        const salesOrder = await tx.salesOrder.findUnique({
          where: { id: job.salesOrderId }
        })
        if (salesOrder) {
          const unitPrice = Number(salesOrder.unitPrice)
          const totalAmount = actualWeight * unitPrice
          
          await tx.salesOrder.update({
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

      // =====================================================
      // DEFERRED COGS POSTING & COST SNAPSHOT
      // =====================================================
      let materialCost = 0
      let consumablesCost = 0
      let overheadCost = 0

      if (totalPrintedWeight > 0) {
        const parentRolls = await tx.roll.findMany({
          where: { id: { in: parentRollIds } },
          include: { material: true }
        })
        
        const parentMaterial = parentRolls[0]?.material
        const costPerKg = parentMaterial?.costPrice ? Number(parentMaterial.costPrice) : 0
        materialCost = totalPrintedWeight * costPerKg

        const rollWasteMap: Record<string, number> = (job.rollWaste as Record<string, number>) ?? {}
        const totalWaste = parentRollIds.reduce((sum, id) => sum + (rollWasteMap[id] ?? 0), 0)
        const wasteCost = totalWaste * costPerKg
        
        const rates = await settingsService.getConsumptionRates()
        
        const consumableMaterials = await tx.material.findMany({
          where: { category: 'INK_SOLVENTS', isActive: true }
        })
        
        const ipaMaterial = consumableMaterials.find(m => m.subCategory === 'IPA')
        const butanolMaterial = consumableMaterials.find(m => m.subCategory === 'Butanol')
        const ipaCostPerLiter = ipaMaterial?.costPrice ? Number(ipaMaterial.costPrice) : 500
        const butanolCostPerLiter = butanolMaterial?.costPrice ? Number(butanolMaterial.costPrice) : 600
        
        // Compute average costPrice of ink materials mapped to this customer's colors
        let avgInkCostPrice = 0
        if (job.customerName) {
          const customer = await tx.customer.findFirst({
            where: { name: { contains: job.customerName, mode: 'insensitive' } }
          })
          const customerColors = customer?.colors || []
          const inkColorRows = await tx.inkColor.findMany({ where: { isActive: true } })
          const inkColorMap = Object.fromEntries(inkColorRows.map(ic => [ic.name, ic.mapping]))
          const subCats = consumableMaterials.map(m => m.subCategory).filter(Boolean) as string[]
          const mappedSubCategories = customerColors.map(c =>
            inkColorMap[c] || subCats.find(sc => sc.toLowerCase() === c.toLowerCase()) || null
          ).filter(Boolean) as string[]
          const mappedInkMats = consumableMaterials.filter(m => mappedSubCategories.includes(m.subCategory || ''))
          if (mappedInkMats.length > 0) {
            avgInkCostPrice = mappedInkMats.reduce((sum, m) => sum + (Number(m.costPrice) || 0), 0) / mappedInkMats.length
          }
        }

        const inkCost = totalPrintedWeight * rates.inkConsumptionRate * avgInkCostPrice
        const ipaCost = totalPrintedWeight * rates.ipaConsumptionRate * ipaCostPerLiter
        const butanolCost = totalPrintedWeight * rates.butanolConsumptionRate * butanolCostPerLiter
        consumablesCost = inkCost + ipaCost + butanolCost
        
        const prodSettings = await settingsService.getSettings()
        const overheadRatePerKg = prodSettings?.overheadRatePerKg ? Number(prodSettings.overheadRatePerKg) : 0
        overheadCost = totalPrintedWeight * overheadRatePerKg
        
        const totalDeferredCost = materialCost + consumablesCost + overheadCost
        
        if (totalDeferredCost > 0) {
          const deferredCogsAccountId = await financeService.getAccountIdByCode('1330')
          const inventoryAccountId = await financeService.getAccountIdByCode('1300')
          const productionCostsAccountId = await financeService.getAccountIdByCode('5200')
          
          const materialsAndConsumablesCost = materialCost + consumablesCost
          await financeService.postJournalEntry({
            description: `Job ${job.jobNumber} completed - Material & Consumables`,
            sourceModule: 'PRODUCTION',
            sourceId: job.id,
            reference: job.jobNumber,
            date,
            lines: [
              { accountId: deferredCogsAccountId, debit: materialsAndConsumablesCost, credit: 0, memo: 'Raw materials & consumables' },
              { accountId: inventoryAccountId, debit: 0, credit: materialsAndConsumablesCost, memo: 'Materials & consumables consumed' }
            ]
          }, tx)
          
          if (wasteCost > 0) {
            await financeService.postJournalEntry({
              description: `Job ${job.jobNumber} - Waste charged to overhead`,
              sourceModule: 'PRODUCTION',
              sourceId: job.id,
              reference: job.jobNumber,
              date,
              lines: [
                { accountId: productionCostsAccountId, debit: wasteCost, credit: 0, memo: 'Production waste' },
                { accountId: inventoryAccountId, debit: 0, credit: wasteCost, memo: 'Waste consumed' }
              ]
            }, tx)
          }
          
          if (overheadCost > 0) {
            await financeService.postJournalEntry({
              description: `Job ${job.jobNumber} - Overhead allocated`,
              sourceModule: 'PRODUCTION',
              sourceId: job.id,
              reference: job.jobNumber,
              date,
              lines: [
                { accountId: deferredCogsAccountId, debit: overheadCost, credit: 0, memo: 'Overhead allocated' },
                { accountId: productionCostsAccountId, debit: 0, credit: overheadCost, memo: 'Production overhead' }
              ]
            }, tx)
          }
          
          logger.info({ jobId: job.id, jobNumber: job.jobNumber, materialCost, inkCost, overheadCost, totalDeferredCost }, 'Deferred COGS posted')
        }
      }

      return tx.productionJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          endDate: dateFromInput(date),
          materialCost,
          consumablesCost,
          overheadCost
        },
        include: {
          printedRolls: {
            include: { roll: true }
          }
        }
      })
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
    if (input.rollWaste !== undefined) updates.rollWaste = input.rollWaste
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
          `Job ${job.jobNumber} deleted`,
          undefined,
          tx
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
        remainingWeight: { gte: 0.1 },
        rollNumber: { not: { startsWith: 'PR' } },
        ...(category ? { material: { subCategory: category } } : {})
      },
      include: { material: true },
      orderBy: { createdAt: 'asc' }
    })
  },

  async getPrintedRolls(status?: string, includeArchived?: boolean) {
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
      orderBy: { endDate: 'desc' }
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
      const mapping = (job as any).printedRollMapping as Record<string, any> || {}
      
      for (const pr of job.printedRolls) {
        if (status && pr.status !== status) continue
        if (!includeArchived && (pr as any).archivedAt) continue
        
        const entry = mapping[pr.id]
        let parentRollsDisplay: string[] = []
        let parentRollContributions: { rollNumber: string; totalWeight: number; contributedWeight: number }[] = []
        
        if (typeof entry === 'object' && entry !== null) {
          // New format: { parentRollId: contributedWeight, ... }
          for (const [parentId, cw] of Object.entries(entry)) {
            const p = parentRollsMap.get(parentId)
            const rn = p?.rollNumber || parentId
            const tw = p?.weight || 0
            parentRollsDisplay.push(`${rn} (${Number(cw).toFixed(2)}kg of ${Number(tw).toFixed(2)}kg)`)
            parentRollContributions.push({ rollNumber: rn, totalWeight: tw, contributedWeight: Number(cw) })
          }
        } else if (typeof entry === 'string' && entry) {
          // Legacy format — entry stores the exact parent roll ID as a string
          const p = parentRollsMap.get(entry)
          if (p) {
            parentRollsDisplay.push(`${p.rollNumber} (${p.weight}kg)`)
            parentRollContributions.push({ rollNumber: p.rollNumber, totalWeight: p.weight, contributedWeight: Number(pr.weightUsed) })
          }
        } else if (entry != null && pr.isCombination) {
          throw new AppError(500, 'INVALID_MAPPING',
            `Printed roll ${pr.roll?.rollNumber || pr.id} is marked as combination but printedRollMapping is in an unrecognized format. Cannot determine parent roll contributions.`)
        } else {
          // No mapping — fallback to all job parent rolls
          for (const id of (job.parentRollIds || [])) {
            const p = parentRollsMap.get(id)
            if (p) {
              parentRollsDisplay.push(`${p.rollNumber} (${p.weight}kg)`)
              parentRollContributions.push({ rollNumber: p.rollNumber, totalWeight: p.weight, contributedWeight: 0 })
            }
          }
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
          parentRollContributions,
          pickedUpAt: pr.pickedUpAt,
          archivedAt: (pr as any).archivedAt,
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

  async getPrintedRollsByParentRoll(parentRollId: string) {
    const jobs = await prisma.productionJob.findMany({
      where: { parentRollIds: { has: parentRollId } },
      include: {
        printedRolls: {
          include: {
            roll: { include: { material: true } },
            customer: true
          }
        },
        salesOrder: { include: { customer: true } }
      },
      orderBy: { startDate: 'desc' }
    })

    const result: any[] = []
    for (const job of jobs) {
      const mapping = (job as any).printedRollMapping as Record<string, any> || {}
      let hasPrintedRolls = false

      for (const pr of job.printedRolls) {
        const entry = mapping[pr.id]
        let contributedWeight = 0
        let relevant = false

        if (typeof entry === 'object' && entry !== null) {
          contributedWeight = Number(entry[parentRollId]) || 0
          relevant = contributedWeight > 0
        } else {
          const mappedParentId = typeof entry === 'string' ? entry : undefined
          relevant = !mappedParentId || mappedParentId === parentRollId ||
            (pr.isCombination && job.parentRollIds?.includes(parentRollId))
          contributedWeight = relevant ? Number(pr.weightUsed) : 0
        }

        if (!relevant) continue
        hasPrintedRolls = true
        result.push({
          id: pr.id,
          rollNumber: pr.roll?.rollNumber || 'N/A',
          weightUsed: Number(pr.weightUsed),
          contributedWeight,
          status: pr.status,
          jobNumber: job.jobNumber,
          customerName: job.customerName || pr.customer?.name || job.salesOrder?.customer?.name || 'N/A',
          pickedUpAt: pr.pickedUpAt,
          createdAt: pr.createdAt,
          isCombination: pr.isCombination,
          isPartialContribution: contributedWeight > 0 && contributedWeight < Number(pr.weightUsed)
        })
      }

      const wasteForRoll = (job.rollWaste as Record<string, number>)?.[parentRollId]
      if (wasteForRoll && wasteForRoll > 0) {
        result.push({
          isWaste: true,
          wasteWeight: wasteForRoll,
          jobNumber: job.jobNumber,
          customerName: job.customerName || job.salesOrder?.customer?.name || 'N/A',
          createdAt: hasPrintedRolls
            ? job.printedRolls.length > 0
              ? job.printedRolls[0].createdAt
              : job.createdAt
            : job.createdAt
        })
      }
    }
    return result
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
  },

  async disposeRoll(rollId: string, reason: string, userId?: string, date?: string) {
    const roll = await prisma.roll.findUnique({
      where: { id: rollId },
      include: { material: true, purchaseOrder: { include: { items: true } } }
    })
    if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found')

    const costPrice = roll.material.costPrice
      ? Number(roll.material.costPrice)
      : roll.purchaseOrder?.items?.[0]?.unitPrice
        ? Number(roll.purchaseOrder.items[0].unitPrice)
        : null
    if (costPrice === null) throw new AppError(400, 'INVALID', 'Set a cost price for this material first')

    const value = Number(roll.remainingWeight) * costPrice

    await prisma.$transaction(async (tx) => {
      const current = await tx.roll.findUnique({ where: { id: rollId } })
      if (!current || current.status !== 'AVAILABLE') {
        throw new AppError(400, 'INVALID', 'Only AVAILABLE rolls can be disposed')
      }

      const isPartiallyConsumed = Number(current.remainingWeight) < Number(current.weight)

      await tx.roll.update({
        where: { id: rollId },
        data: {
          status: isPartiallyConsumed ? 'CONSUMED' : 'WASTED',
          disposedAt: dateFromInput(date),
          disposedById: userId,
          disposalReason: reason
        }
      })

      const scrapAccount = await financeService.getAccountIdByCode('5300')
      const inventoryAccount = await financeService.getAccountIdByCode('1300')

      await financeService.postJournalEntry({
        description: `Scrapped roll ${roll.rollNumber} - ${reason}`,
        sourceModule: 'ADJUSTMENT',
        sourceId: rollId,
        reference: roll.rollNumber,
        postedById: userId,
        date,
        lines: [
          { accountId: scrapAccount, debit: value, credit: 0, memo: `${reason} - ${roll.rollNumber}` },
          { accountId: inventoryAccount, debit: 0, credit: value, memo: `Roll removed from inventory` }
        ]
      }, tx)
    })

    return { success: true }
  },

  async returnRoll(rollId: string, userId?: string, date?: string) {
    const roll = await prisma.roll.findUnique({
      where: { id: rollId },
      include: { material: true, purchaseOrder: { include: { items: true } } }
    })
    if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found')

    const costPrice = roll.material.costPrice
      ? Number(roll.material.costPrice)
      : roll.purchaseOrder?.items?.[0]?.unitPrice
        ? Number(roll.purchaseOrder.items[0].unitPrice)
        : null
    if (costPrice === null) throw new AppError(400, 'INVALID', 'Set a cost price for this material first')

    const value = Number(roll.remainingWeight) * costPrice

    await prisma.$transaction(async (tx) => {
      const current = await tx.roll.findUnique({ where: { id: rollId } })
      if (!current || current.status !== 'AVAILABLE') {
        throw new AppError(400, 'INVALID', 'Only AVAILABLE rolls can be returned')
      }

      const isPartiallyConsumed = Number(current.remainingWeight) < Number(current.weight)

      await tx.roll.update({
        where: { id: rollId },
        data: {
          status: isPartiallyConsumed ? 'CONSUMED' : 'RETURNED',
          disposedAt: dateFromInput(date),
          disposedById: userId,
          disposalReason: 'Returned to supplier'
        }
      })

      const apAccount = await financeService.getAccountIdByCode('2000')
      const inventoryAccount = await financeService.getAccountIdByCode('1300')

      await financeService.postJournalEntry({
        description: `Returned roll ${roll.rollNumber} to supplier${roll.purchaseOrder?.supplier ? ` (${roll.purchaseOrder.supplier})` : ''}`,
        sourceModule: 'ADJUSTMENT',
        sourceId: rollId,
        reference: roll.rollNumber,
        postedById: userId,
        date,
        lines: [
          { accountId: apAccount, debit: value, credit: 0, memo: `Credit note - ${roll.rollNumber}` },
          { accountId: inventoryAccount, debit: 0, credit: value, memo: `Roll returned to supplier` }
        ]
      }, tx)
    })

    return { success: true, supplier: roll.purchaseOrder?.supplier || null }
  },

  async customerReturnRoll(printedRollId: string, data: { qty: number; reason: string; condition: string; refundMethod?: string; userId?: string; date?: string }) {
    const printedRoll = await prisma.printedRoll.findUnique({
      where: { id: printedRollId },
      include: {
        productionJob: true,
        roll: true,
        customer: true
      }
    })
    if (!printedRoll) throw new AppError(404, 'NOT_FOUND', 'Printed roll not found')
    if (printedRoll.status !== 'PICKED_UP') throw new AppError(400, 'INVALID', 'Only PICKED_UP printed rolls can be returned')
    if (!['SCRAP', 'RETURN_TO_SUPPLIER'].includes(data.condition)) throw new AppError(400, 'INVALID', 'Condition must be SCRAP or RETURN_TO_SUPPLIER')

    const parentRollIds = printedRoll.productionJob.parentRollIds
    if (!parentRollIds || parentRollIds.length === 0) throw new AppError(400, 'INVALID', 'No parent roll found for this printed roll')

    const parentRolls = await prisma.roll.findMany({
      where: { id: { in: parentRollIds } },
      include: { material: true }
    })
    const parentRoll = parentRolls[0]
    if (!parentRoll) throw new AppError(400, 'INVALID', 'No parent roll found for this printed roll')

    const material = parentRoll.material
    const costPrice = material.costPrice ? Number(material.costPrice) : null
    if (costPrice === null) throw new AppError(400, 'INVALID', 'Set a cost price for this material first')

    const value = data.qty * costPrice

    const today = new Date()
    const prefix = `RL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
    const lastRoll = await prisma.roll.findFirst({
      where: { rollNumber: { startsWith: prefix } },
      orderBy: { rollNumber: 'desc' }
    })
    const newRollNumber = lastRoll
      ? `${prefix}${String(parseInt(lastRoll.rollNumber.replace(prefix, '')) + 1).padStart(4, '0')}`
      : `${prefix}0001`

    await prisma.$transaction(async (tx) => {
      await tx.printedRoll.update({
        where: { id: printedRollId },
        data: {
          status: 'RETURNED',
          returnedQty: data.qty,
          returnReason: data.reason,
          returnedAt: dateFromInput(data.date),
          refundMethod: data.refundMethod || 'NONE',
          returnCondition: data.condition
        }
      })

      await tx.roll.create({
        data: {
          rollNumber: newRollNumber,
          materialId: material.id,
          weight: data.qty,
          remainingWeight: data.qty,
          status: 'AVAILABLE',
          notes: `Created from customer return of printed roll (${printedRoll.roll?.rollNumber || printedRollId})`
        }
      })

      const inventoryAccount = await financeService.getAccountIdByCode('1300')
      const otherIncomeAccount = await financeService.getAccountIdByCode('4200')
      await financeService.postJournalEntry({
        description: `Returned printed roll received back - ${printedRoll.roll?.rollNumber || newRollNumber}`,
        sourceModule: 'ADJUSTMENT',
        sourceId: printedRollId,
        reference: newRollNumber,
        postedById: data.userId,
        date: data.date,
        lines: [
          { accountId: inventoryAccount, debit: value, credit: 0, memo: `Returned goods added to inventory - ${newRollNumber}` },
          { accountId: otherIncomeAccount, debit: 0, credit: value, memo: `Other income - returned goods received without refund` }
        ]
      }, tx)

      if (data.condition === 'SCRAP') {
        const scrapAccount = await financeService.getAccountIdByCode('5300')
        await tx.roll.update({
          where: { rollNumber: newRollNumber },
          data: { status: 'WASTED', disposedAt: dateFromInput(data.date), disposedById: data.userId, disposalReason: `Customer return - ${data.reason}` }
        })
        await financeService.postJournalEntry({
          description: `Scrapped returned printed roll - ${data.reason}`,
          sourceModule: 'ADJUSTMENT',
          sourceId: printedRollId,
          reference: newRollNumber,
          postedById: data.userId,
          date: data.date,
          lines: [
            { accountId: scrapAccount, debit: value, credit: 0, memo: `Customer return scrap - ${newRollNumber}` },
            { accountId: inventoryAccount, debit: 0, credit: value, memo: `Returned roll scrapped` }
          ]
        }, tx)
      } else {
        const apAccount = await financeService.getAccountIdByCode('2000')
        await tx.roll.update({
          where: { rollNumber: newRollNumber },
          data: { status: 'RETURNED', disposedAt: dateFromInput(data.date), disposedById: data.userId, disposalReason: `Customer return - returned to supplier` }
        })
        await financeService.postJournalEntry({
          description: `Returned printed roll to supplier - ${data.reason}`,
          sourceModule: 'ADJUSTMENT',
          sourceId: printedRollId,
          reference: newRollNumber,
          postedById: data.userId,
          date: data.date,
          lines: [
            { accountId: apAccount, debit: value, credit: 0, memo: `Credit note - ${newRollNumber}` },
            { accountId: inventoryAccount, debit: 0, credit: value, memo: `Roll returned to supplier from customer return` }
          ]
        }, tx)
      }
    })

    return { success: true }
  },

  async receiveReplacement(rollId: string, userId?: string, date?: string) {
    const roll = await prisma.roll.findUnique({
      where: { id: rollId },
      include: { material: true }
    })
    if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found')
    if (roll.status !== 'RETURNED') throw new AppError(400, 'INVALID', 'Only RETURNED rolls can be replaced')
    if (roll.replacementReceived) throw new AppError(400, 'INVALID', 'Replacement already received for this roll')

    const costPrice = roll.material.costPrice ? Number(roll.material.costPrice) : null
    if (costPrice === null) throw new AppError(400, 'INVALID', 'Set a cost price for this material first')

    const value = Number(roll.remainingWeight) * costPrice

    const today = new Date()
    const prefix = `RL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}-`
    const lastRoll = await prisma.roll.findFirst({
      where: { rollNumber: { startsWith: prefix } },
      orderBy: { rollNumber: 'desc' }
    })
    const newRollNumber = lastRoll
      ? `${prefix}${String(parseInt(lastRoll.rollNumber.replace(prefix, '')) + 1).padStart(4, '0')}`
      : `${prefix}0001`

    await prisma.$transaction(async (tx) => {
      const newRoll = await tx.roll.create({
        data: {
          rollNumber: newRollNumber,
          materialId: roll.materialId,
          weight: roll.remainingWeight,
          remainingWeight: roll.remainingWeight,
          status: 'AVAILABLE',
          notes: `Replacement for returned roll ${roll.rollNumber}`
        }
      })

      await tx.roll.update({
        where: { id: rollId },
        data: {
          replacementReceived: true,
          notes: roll.notes
            ? `${roll.notes} | Replacement: ${newRollNumber}`
            : `Replacement received: ${newRollNumber}`
        }
      })

      const inventoryAccount = await financeService.getAccountIdByCode('1300')
      const apAccount = await financeService.getAccountIdByCode('2000')

      await financeService.postJournalEntry({
        description: `Replacement roll ${newRollNumber} for returned roll ${roll.rollNumber}`,
        sourceModule: 'ADJUSTMENT',
        sourceId: rollId,
        reference: newRollNumber,
        postedById: userId,
        date,
        lines: [
          { accountId: inventoryAccount, debit: value, credit: 0, memo: `Replacement - ${newRollNumber}` },
          { accountId: apAccount, debit: 0, credit: value, memo: `Replacement for returned roll ${roll.rollNumber}` }
        ]
      }, tx)
    })

    return { success: true, rollNumber: newRollNumber }
  },

  async archiveOldPrintedRolls(userId?: string) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const result = await (prisma.printedRoll.updateMany as any)({
      where: {
        status: 'PICKED_UP',
        pickedUpAt: { lt: cutoff },
        archivedAt: null
      },
      data: { archivedAt: new Date() }
    })
    logger.info({ count: result.count, userId }, 'Archived old picked-up printed rolls')
    return { archived: result.count }
  }
}
