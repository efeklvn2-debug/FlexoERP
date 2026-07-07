const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  // Exact query the backend runs
  const orders = await prisma.salesOrder.findMany({
    where: { isDeleted: false },
    include: { customer: true },
    orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
    take: 50
  });
  console.log('Orders returned:', orders.length);
  console.log('First 5:', JSON.stringify(orders.slice(0,5).map(o => ({ orderNumber: o.orderNumber, status: o.status, approvedAt: o.approvedAt, createdAt: o.createdAt })), null, 2));
  console.log('Last 5:', JSON.stringify(orders.slice(-5).map(o => ({ orderNumber: o.orderNumber, status: o.status, approvedAt: o.approvedAt, createdAt: o.createdAt })), null, 2));
  
  // Check if recent orders appear
  const recent = orders.filter(o => o.orderNumber === 'SO-2026-0142' || o.orderNumber === 'SO-2026-0141');
  console.log('\nRecent orders in result:', recent.length);
  console.log('\nNull approvedAt count:', orders.filter(o => !o.approvedAt).length);
  await prisma.$disconnect();
}
main();
