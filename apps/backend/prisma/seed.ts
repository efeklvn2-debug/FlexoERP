import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const passwordHash = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      role: 'ADMIN'
    }
  })
  console.log('Created admin user (admin/admin123)')

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

  const existingAccounts = await prisma.account.findMany()
  if (existingAccounts.length === 0) {
    const accounts = [
      { code: '1000', name: 'Cash', type: 'ASSET' as const, description: 'Cash on hand' },
      { code: '1100', name: 'Bank', type: 'ASSET' as const, description: 'Bank accounts' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET' as const, description: 'Money owed by customers' },
      { code: '1300', name: 'Raw Material Inventory', type: 'ASSET' as const, description: 'Plain rolls, ink, solvents' },
      { code: '1310', name: 'Work in Progress', type: 'ASSET' as const, description: 'Materials in production' },
      { code: '1320', name: 'Finished Goods', type: 'ASSET' as const, description: 'Printed rolls ready for sale' },
      { code: '1400', name: 'VAT Input', type: 'ASSET' as const, isVatEnabled: true, description: 'VAT paid on purchases' },
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
