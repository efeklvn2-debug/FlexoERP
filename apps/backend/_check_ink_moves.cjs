const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

(async () => {
  const total = await db.stockMovement.count({ where: { material: { category: 'INK_SOLVENTS' } } });
  console.log('Total INK_SOLVENTS movements ever:', total);

  const job = await db.productionJob.findUnique({
    where: { jobNumber: 'PRD-2026-0107' },
    select: { customerName: true, endDate: true, printedRolls: { select: { weightUsed: true } } }
  });
  console.log('Job customerName:', job?.customerName);
  const totalWeight = job?.printedRolls?.reduce((s, r) => s + Number(r.weightUsed), 0) ?? 0;
  console.log('Total printed weight:', totalWeight);

  const c = await db.customer.findFirst({ where: { name: { contains: 'Flora', mode: 'insensitive' } }, select: { name: true, colors: true } });
  console.log('Found customer:', c?.name, 'colors:', c?.colors);

  // Also check if VioletBlue Ink color exists with proper mapping
  const ic = await db.inkColor.findFirst({ where: { name: 'VioletBlue' }, select: { name: true, mapping: true, isActive: true } });
  console.log('InkColor VioletBlue:', ic);

  // Check VioletBlue-Ink material exists and is active
  const mat = await db.material.findFirst({ where: { subCategory: 'VioletBlue-Ink' }, select: { name: true, isActive: true, unitOfMeasure: true } });
  console.log('Material VioletBlue-Ink:', mat);

  // Check royal blue ink stock
  const stock = await db.stock.findMany({ where: { material: { subCategory: 'VioletBlue-Ink' } }, select: { quantity: true, location: true } });
  console.log('VioletBlue-Ink stock:', stock.map(s => ({ qty: Number(s.quantity), loc: s.location })));

  await db.$disconnect();
})();
