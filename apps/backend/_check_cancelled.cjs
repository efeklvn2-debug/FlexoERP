const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const orders = await prisma.salesOrder.findMany({
    where: { orderNumber: { in: ['SO-2026-0047', 'SO-2026-0048', 'SO-2026-0049', 'SO-2026-0050', 'SO-2026-0051', 'SO-2026-0052', 'SO-2026-0053'] } },
    include: { customer: true, productionJob: true },
    orderBy: { orderNumber: 'asc' }
  });
  for (const o of orders) {
    console.log(JSON.stringify({
      orderNumber: o.orderNumber,
      customer: o.customer?.name,
      status: o.status,
      createdAt: o.createdAt,
      approvedAt: o.approvedAt,
      cancelledAt: o.cancelledAt,
      cancelledById: o.cancelledById,
      productionJobId: o.productionJobId,
      notes: o.notes
    }, null, 2));
  }
  await prisma.$disconnect();
}
main();
