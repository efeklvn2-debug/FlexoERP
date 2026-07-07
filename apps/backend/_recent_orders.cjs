const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const recent = await prisma.salesOrder.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { orderNumber: true, status: true, createdAt: true, approvedAt: true, customerId: true }
  });
  console.log('Most recent 10 orders (by createdAt desc):');
  console.log(JSON.stringify(recent, null, 2));
  await prisma.$disconnect();
}
main();
