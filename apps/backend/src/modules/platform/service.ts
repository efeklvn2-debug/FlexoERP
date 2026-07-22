import bcrypt from 'bcryptjs'
import { prisma } from '../../database'
import { runWithTenant } from '../../context'
import { AppError } from '../../middleware/errorHandler'
import { createChildLogger } from '../../logger'
import { CreateTenantInput, CreateTenantUserInput, UpdateTenantInput } from './validation'

const logger = createChildLogger('platform:service')

const DEFAULT_INK_COLORS = [
  { name: 'RoyalBlue', mapping: 'RoyalBlue-Ink' },
  { name: 'VioletBlue', mapping: 'VioletBlue-Ink' },
  { name: 'SkyBlue', mapping: 'SkyBlue-Ink' },
]

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'ASSET' as const, description: 'Cash on hand' },
  { code: '1100', name: 'Bank', type: 'ASSET' as const, description: 'Bank accounts' },
  { code: '1200', name: 'Accounts Receivable', type: 'ASSET' as const, description: 'Money owed by customers' },
  { code: '1300', name: 'Raw Material Inventory', type: 'ASSET' as const, description: 'Plain rolls, ink, solvents' },
  { code: '1310', name: 'Work in Progress', type: 'ASSET' as const, description: 'Materials in production' },
  { code: '1320', name: 'Finished Goods', type: 'ASSET' as const, description: 'Printed rolls ready for sale' },
  { code: '1330', name: 'Deferred Cost of Goods Sold', type: 'ASSET' as const, description: 'Cost of completed jobs awaiting delivery' },
  { code: '1400', name: 'VAT Input', type: 'ASSET' as const, isVatEnabled: true, description: 'VAT paid on purchases' },
  { code: '1510', name: 'Packing Bag Inventory', type: 'ASSET' as const, description: 'Packing bags held for resale' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const, description: 'Money owed to suppliers' },
  { code: '2100', name: 'VAT Output', type: 'LIABILITY' as const, isVatEnabled: true, description: 'VAT collected on sales' },
  { code: '2200', name: 'Customer Deposits', type: 'LIABILITY' as const, description: 'Core deposits held' },
  { code: '3000', name: 'Opening Balance Equity', type: 'EQUITY' as const, description: 'Opening balances' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY' as const, description: 'Accumulated profits' },
  { code: '4000', name: 'Sales Revenue', type: 'REVENUE' as const, description: 'Income from printed roll sales' },
  { code: '4100', name: 'Packing Bags Revenue', type: 'REVENUE' as const, description: 'Income from packing bag sales' },
  { code: '4200', name: 'Other Income', type: 'REVENUE' as const, description: 'Miscellaneous income' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'COGS' as const, description: 'Material cost of goods sold' },
  { code: '5100', name: 'Material Costs', type: 'COGS' as const, description: 'Plain roll material costs' },
  { code: '5200', name: 'Production Costs', type: 'COGS' as const, description: 'Direct production costs' },
  { code: '6000', name: 'Fuel & Transport', type: 'EXPENSE' as const, description: 'Fuel and transportation expenses' },
  { code: '6100', name: 'Maintenance', type: 'EXPENSE' as const, description: 'Equipment maintenance' },
  { code: '6200', name: 'Diesel', type: 'EXPENSE' as const, description: 'Generator diesel' },
  { code: '6300', name: 'Salaries', type: 'EXPENSE' as const, description: 'Staff salaries' },
  { code: '6400', name: 'Administrative', type: 'EXPENSE' as const, description: 'Office and administrative expenses' },
  { code: '6500', name: 'Utilities', type: 'EXPENSE' as const, description: 'Electricity, water, etc.' },
  { code: '6600', name: 'Miscellaneous', type: 'EXPENSE' as const, description: 'Other expenses' },
]

async function seedTenantDefaults(tenantId: string) {
  await runWithTenant(tenantId, async () => {
    for (const ic of DEFAULT_INK_COLORS) {
      await prisma.inkColor.upsert({
        where: { tenantId_name: { tenantId, name: ic.name } },
        update: {},
        create: ic as any,
      })
    }
    logger.info({ tenantId }, 'Seeded default ink colors')

    const existingAccounts = await prisma.account.findMany()
    if (existingAccounts.length === 0) {
      for (const acc of DEFAULT_ACCOUNTS) {
        await prisma.account.create({ data: acc as any })
      }
      logger.info({ tenantId }, 'Seeded default chart of accounts')
    }

    const existingSettings = await prisma.settings.findFirst()
    if (!existingSettings) {
      await prisma.settings.create({ data: {} as any })
      logger.info({ tenantId }, 'Seeded default settings')
    }
  })
}

export const platformService = {
  async listTenants() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            salesOrders: true,
            customers: true,
          },
        },
      },
    })
    return tenants.map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      userCount: t._count.users,
      salesOrderCount: t._count.salesOrders,
      customerCount: t._count.customers,
    }))
  },

  async getTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, username: true, role: true, isActive: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            salesOrders: true,
            customers: true,
            materials: true,
            productionJobs: true,
          },
        },
      },
    })
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')
    return tenant
  },

  async createTenant(input: CreateTenantInput) {
    const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } })
    if (existing) {
      throw new AppError(409, 'TENANT_EXISTS', `Tenant with slug '${input.slug}' already exists`)
    }

    const tenant = await prisma.tenant.create({
      data: { name: input.name, slug: input.slug },
    })
    logger.info({ tenantId: tenant.id, name: tenant.name }, 'Tenant created')

    await seedTenantDefaults(tenant.id)

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
    }
  },

  async updateTenant(id: string, input: UpdateTenantInput) {
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

    const updated = await prisma.tenant.update({
      where: { id },
      data: input,
    })
    logger.info({ tenantId: id, updates: input }, 'Tenant updated')
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    }
  },

  async deleteTenant(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } })
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

    await prisma.$transaction(async (tx) => {
      // Clear self-referencing FKs before deleting
      await tx.roll.updateMany({ where: { tenantId: id, parentRollId: { not: null } }, data: { parentRollId: null } })
      await tx.account.updateMany({ where: { tenantId: id, parentId: { not: null } }, data: { parentId: null } })

      // Level 1: Leaf nodes (no FK dependencies on other tenant-scoped models)
      await tx.auditLog.deleteMany({ where: { tenantId: id } })
      await tx.settings.deleteMany({ where: { tenantId: id } })
      await tx.overheadRateHistory.deleteMany({ where: { tenantId: id } })
      await tx.materialIssue.deleteMany({ where: { tenantId: id } })
      await tx.idempotencyKey.deleteMany({ where: { tenantId: id } })
      await tx.refreshToken.deleteMany({ where: { tenantId: id } })

      // Level 2: Child records of mid-level parents
      await tx.stockMovement.deleteMany({ where: { tenantId: id } })
      await tx.pOLineItem.deleteMany({ where: { tenantId: id } })
      await tx.journalLine.deleteMany({ where: { tenantId: id } })
      await tx.priceList.deleteMany({ where: { tenantId: id } })
      await tx.paymentMade.deleteMany({ where: { tenantId: id } })
      await tx.paymentReceived.deleteMany({ where: { tenantId: id } })
      await tx.receipt.deleteMany({ where: { tenantId: id } })
      await tx.supplierInvoice.deleteMany({ where: { tenantId: id } })
      await tx.orderItem.deleteMany({ where: { tenantId: id } })
      await tx.coreBuyback.deleteMany({ where: { tenantId: id } })

      // Level 3: Models with FKs to Material, Supplier, Customer
      await tx.roll.deleteMany({ where: { tenantId: id } })
      await tx.printedRoll.deleteMany({ where: { tenantId: id } })
      await tx.stock.deleteMany({ where: { tenantId: id } })
      await tx.productionJob.deleteMany({ where: { tenantId: id } })
      await tx.invoice.deleteMany({ where: { tenantId: id } })

      // Level 4: Parent models with FKs to other tenant-scoped models
      await tx.purchaseOrder.deleteMany({ where: { tenantId: id } })
      await tx.paymentTransaction.deleteMany({ where: { tenantId: id } })
      await tx.transaction.deleteMany({ where: { tenantId: id } })
      await tx.salesOrder.deleteMany({ where: { tenantId: id } })
      await tx.order.deleteMany({ where: { tenantId: id } })
      await tx.journalEntry.deleteMany({ where: { tenantId: id } })

      // Level 5: Top-level tenant-scoped models
      await tx.customer.deleteMany({ where: { tenantId: id } })
      await tx.supplier.deleteMany({ where: { tenantId: id } })
      await tx.material.deleteMany({ where: { tenantId: id } })
      await tx.account.deleteMany({ where: { tenantId: id } })
      await tx.inkColor.deleteMany({ where: { tenantId: id } })

      // Level 6: User depends on Tenant
      await tx.user.deleteMany({ where: { tenantId: id } })

      // Finally: Delete the tenant itself
      await tx.tenant.delete({ where: { id } })
    })

    logger.info({ tenantId: id, name: tenant.name }, 'Tenant deleted')
    return { id, name: tenant.name }
  },

  async createTenantUser(tenantId: string, input: CreateTenantUserInput) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')
    if (!tenant.isActive) throw new AppError(400, 'TENANT_INACTIVE', 'Cannot create users for inactive tenant')

    const existingUser = await prisma.user.findUnique({ where: { username: input.username } })
    if (existingUser) {
      throw new AppError(409, 'USER_EXISTS', `Username '${input.username}' is already taken`)
    }

    const passwordHash = await bcrypt.hash(input.password, 12)

    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash,
        role: input.role,
        tenantId,
      } as any,
    })
    logger.info({ userId: user.id, username: user.username, tenantId }, 'Tenant user created')

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      tenantId,
    }
  },
}
