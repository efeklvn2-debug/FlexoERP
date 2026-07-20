import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN'
    }
  })
  console.log('Created admin user (admin/' + adminPassword + ')')

  // test users for other roles
  const makeUser = async (username: string, role: string) => {
    const h = await bcrypt.hash('test123', 10)
    await prisma.user.upsert({
      where: { username },
      update: {},
      create: { username, passwordHash: h, role: role as any }
    })
    console.log(`Created ${role.toLowerCase()} user (${username}/test123)`)
  }
  await makeUser('manager', 'MANAGER')
  await makeUser('operator', 'OPERATOR')
  await makeUser('viewer', 'VIEWER')

  // ── Permissions ──────────────────────────────────────────────────────
  const permDefs = [
    { name: 'auth:read',                description: 'View own profile',                        module: 'auth' },
    { name: 'auth:manage_users',         description: 'Create and manage users',                 module: 'auth' },
    { name: 'sales_order:read',          description: 'View sales orders',                       module: 'sales_orders' },
    { name: 'sales_order:create',        description: 'Create sales orders',                     module: 'sales_orders' },
    { name: 'sales_order:edit',          description: 'Edit sales orders',                       module: 'sales_orders' },
    { name: 'sales_order:approve',       description: 'Approve sales orders for production',     module: 'sales_orders' },
    { name: 'sales_order:delete',        description: 'Delete or cancel sales orders',           module: 'sales_orders' },
    { name: 'sales_order:pickup',        description: 'Record customer pickups',                module: 'sales_orders' },
    { name: 'sales_order:payment',       description: 'Record payments against orders',          module: 'sales_orders' },
    { name: 'sales_order:adjust_deposit', description: 'Adjust customer deposits',               module: 'sales_orders' },
    { name: 'production:read',           description: 'View production jobs',                    module: 'production' },
    { name: 'production:create',         description: 'Create or start production jobs',         module: 'production' },
    { name: 'production:complete',       description: 'Complete / close production jobs',        module: 'production' },
    { name: 'production:edit',           description: 'Edit production jobs',                    module: 'production' },
    { name: 'production:delete',         description: 'Delete or archive old jobs',              module: 'production' },
    { name: 'inventory:read',            description: 'View inventory and stock',                module: 'inventory' },
    { name: 'inventory:create',          description: 'Add new materials',                       module: 'inventory' },
    { name: 'inventory:edit',            description: 'Edit material definitions',               module: 'inventory' },
    { name: 'inventory:adjust',          description: 'Adjust stock quantities',                 module: 'inventory' },
    { name: 'inventory:dispose',         description: 'Dispose or mark rolls as consumed',       module: 'inventory' },
    { name: 'procurement:read',          description: 'View purchase orders',                    module: 'procurement' },
    { name: 'procurement:create',        description: 'Create purchase orders',                  module: 'procurement' },
    { name: 'procurement:receive',       description: 'Receive PO items into inventory',         module: 'procurement' },
    { name: 'procurement:edit',          description: 'Edit purchase orders',                    module: 'procurement' },
    { name: 'finance:read',              description: 'View accounts and journal entries',        module: 'finance' },
    { name: 'finance:write',             description: 'Post manual journal entries',              module: 'finance' },
    { name: 'finance:manage_accounts',   description: 'Add or edit chart of accounts',           module: 'finance' },
    { name: 'settings:read',             description: 'View business settings',                  module: 'settings' },
    { name: 'settings:write',            description: 'Update business settings',                module: 'settings' },
    { name: 'settings:manage_materials', description: 'Add or edit material definitions',         module: 'settings' },
    { name: 'settings:manage_colors',    description: 'Manage ink color mappings',               module: 'settings' },
    { name: 'customer:read',             description: 'View customers',                          module: 'customers' },
    { name: 'customer:create',           description: 'Add new customers',                       module: 'customers' },
    { name: 'customer:edit',             description: 'Edit customer details',                   module: 'customers' },
    { name: 'customer:payment',          description: 'Record customer payments and deposits',    module: 'customers' },
    { name: 'supplier:read',             description: 'View suppliers',                          module: 'suppliers' },
    { name: 'supplier:create',           description: 'Add suppliers',                           module: 'suppliers' },
    { name: 'supplier:edit',             description: 'Edit supplier details',                   module: 'suppliers' },
    { name: 'report:read',               description: 'View reports',                            module: 'reports' },
    { name: 'pricing:read',              description: 'View price lists',                        module: 'pricing' },
    { name: 'pricing:write',             description: 'Set and update price lists',              module: 'pricing' },
  ] as const

  const perms = new Map<string, string>()
  for (const p of permDefs) {
    const created = await prisma.permission.upsert({
      where: { name: p.name },
      update: { description: p.description, module: p.module },
      create: { name: p.name, description: p.description, module: p.module }
    })
    perms.set(p.name, created.id)
  }
  console.log(`Created ${permDefs.length} permissions`)

  // ── Role → Permission mappings ─────────────────────────────────────
  type Role = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER'

  const rolePerms: Record<Role, string[]> = {
    ADMIN: permDefs.map(p => p.name),
    MANAGER: permDefs.filter(p => p.name !== 'auth:manage_users').map(p => p.name),
    OPERATOR: permDefs.filter(p => p.name !== 'auth:manage_users').map(p => p.name),
    VIEWER: [
      'auth:read',
      'sales_order:read',
      'production:read',
      'inventory:read',
      'finance:read',
      'settings:read',
      'customer:read',
      'supplier:read',
      'report:read',
      'pricing:read',
    ],
  }

  for (const [role, permNames] of Object.entries(rolePerms)) {
    for (const name of permNames) {
      const permId = perms.get(name)
      if (!permId) continue
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as Role, permissionId: permId } },
        update: {},
        create: { role: role as Role, permissionId: permId }
      })
    }
  }
  console.log('Created role → permission mappings')

  const materials = [
    { code: 'PR25', name: '25 Microns', category: 'PLAIN_ROLLS' as const, subCategory: '25microns', unitOfMeasure: 'kg', costPrice: 2900, coreWeight: 0.7 },
    { code: 'PR27', name: '27 Microns', category: 'PLAIN_ROLLS' as const, subCategory: '27microns', unitOfMeasure: 'kg', costPrice: 2890, coreWeight: 0.7 },
    { code: 'PR28', name: '28 Microns', category: 'PLAIN_ROLLS' as const, subCategory: '28microns', unitOfMeasure: 'kg', costPrice: 2890, coreWeight: 0.7 },
    { code: 'PR30', name: '30 Microns', category: 'PLAIN_ROLLS' as const, subCategory: '30microns', unitOfMeasure: 'kg', costPrice: 2870, coreWeight: 0.7 },
    { code: 'PRPRE', name: 'Premium Film', category: 'PLAIN_ROLLS' as const, subCategory: 'Premium', unitOfMeasure: 'kg', costPrice: 3430, coreWeight: 0.7 },
    { code: 'PRSUP', name: 'Super Premium Film', category: 'PLAIN_ROLLS' as const, subCategory: 'SuPremium', unitOfMeasure: 'kg', costPrice: 3450, coreWeight: 0.7 },
    { code: 'IPA', name: 'IPA', category: 'INK_SOLVENTS' as const, subCategory: 'IPA', unitOfMeasure: 'liter', costPrice: 500, drumSize: 200, minStock: 200 },
    { code: 'BUT', name: 'Butanol', category: 'INK_SOLVENTS' as const, subCategory: 'Butanol', unitOfMeasure: 'liter', costPrice: 600, drumSize: 200, minStock: 200 },
    { code: 'INKR', name: 'Red Ink', category: 'INK_SOLVENTS' as const, subCategory: 'Red-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'INKY', name: 'Yellow Ink', category: 'INK_SOLVENTS' as const, subCategory: 'Yellow-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'INKW', name: 'White Ink', category: 'INK_SOLVENTS' as const, subCategory: 'White-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'INKRB', name: 'Royal Blue Ink', category: 'INK_SOLVENTS' as const, subCategory: 'RoyalBlue-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'INKVB', name: 'Violet Blue Ink', category: 'INK_SOLVENTS' as const, subCategory: 'VioletBlue-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'INKSB', name: 'Sky Blue Ink', category: 'INK_SOLVENTS' as const, subCategory: 'SkyBlue-Ink', unitOfMeasure: 'kg', costPrice: 5000, drumSize: 23, minStock: 23 },
    { code: 'PBAG', name: 'Packing Bag', category: 'PACKAGING' as const, subCategory: 'PackingBag', unitOfMeasure: 'bundle', costPrice: 1250, packSize: 10, minStock: 50 },
  ]

  for (const mat of materials) {
    await prisma.material.upsert({
      where: { code: mat.code },
      update: {},
      create: mat
    })
  }
  console.log(`Created ${materials.length} materials`)

  const allMats = await prisma.material.findMany()
  for (const mat of allMats) {
    await prisma.stock.upsert({
      where: { materialId_location: { materialId: mat.id, location: 'MAIN' } },
      update: {},
      create: { materialId: mat.id, quantity: 0, location: 'MAIN' }
    })
  }
  console.log('Created stock locations')

  const defaultInkColors = [
    { name: 'RoyalBlue', mapping: 'RoyalBlue-Ink' },
    { name: 'VioletBlue', mapping: 'VioletBlue-Ink' },
    { name: 'SkyBlue', mapping: 'SkyBlue-Ink' }
  ]
  for (const ic of defaultInkColors) {
    await prisma.inkColor.upsert({
      where: { name: ic.name },
      update: {},
      create: ic
    })
  }
  console.log(`Created ${defaultInkColors.length} default ink colors`)

  const existingAccounts = await prisma.account.findMany()
  if (existingAccounts.length === 0) {
    const accounts = [
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
      { code: '6600', name: 'Miscellaneous', type: 'EXPENSE' as const, description: 'Other expenses' }
    ]

    for (const acc of accounts) {
      await prisma.account.create({ data: acc as any })
    }
    console.log(`Created ${accounts.length} chart of accounts`)
  } else {
    console.log('Chart of accounts already exists')
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
