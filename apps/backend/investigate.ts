import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const j = await db.productionJob.findUnique({
    where: { jobNumber: 'SO-2026-0123' },
    select: {
      id: true, jobNumber: true, customerName: true,
      salesOrder: { select: { customer: { select: { name: true, colors: true } } } }
    }
  })
  console.log('Job:', JSON.stringify(j, null, 2))

  const stock = await db.stock.findMany({
    where: { material: { subCategory: 'Brown-Ink' } },
    include: { material: { select: { name: true, subCategory: true } } }
  })
  console.log('Stock for Brown-Ink:', JSON.stringify(stock, null, 2))

  // Also check if job has a customerName that matches a customer
  if (j?.customerName) {
    const cust = await db.customer.findFirst({
      where: { name: { contains: j.customerName, mode: 'insensitive' } },
      select: { name: true, colors: true }
    })
    console.log('Customer match for "' + j.customerName + '":', JSON.stringify(cust))
  }

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
