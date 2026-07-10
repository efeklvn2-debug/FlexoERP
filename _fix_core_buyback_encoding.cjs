// Fix corrupted Naira symbol in core buyback transaction descriptions
// Run: node _fix_core_buyback_encoding.cjs
// Replaces Γéª → ₦ in PaymentTransaction.notes and JournalEntry.description

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function fix() {
  const corrupted = 'Γéª'
  const correct = '₦'

  console.log('Fixing PaymentTransaction.notes...')
  const txRecords = await prisma.paymentTransaction.findMany({
    where: { notes: { contains: corrupted } },
    select: { id: true, notes: true }
  })
  for (const r of txRecords) {
    await prisma.paymentTransaction.update({
      where: { id: r.id },
      data: { notes: r.notes.replace(new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct) }
    })
  }
  console.log(`  Updated ${txRecords.length} payment transactions`)

  console.log('Fixing JournalEntry.description...')
  const jeRecords = await prisma.journalEntry.findMany({
    where: { description: { contains: corrupted } },
    select: { id: true, description: true }
  })
  for (const r of jeRecords) {
    await prisma.journalEntry.update({
      where: { id: r.id },
      data: { description: r.description.replace(new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct) }
    })
  }
  console.log(`  Updated ${jeRecords.length} journal entries`)

  console.log('Done.')
  await prisma.$disconnect()
}

fix().catch(err => { console.error(err); process.exit(1) })
