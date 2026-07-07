const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const moves = await db.stockMovement.findMany({
    where: { OR: [
      { reference: { contains: 'PRD-2026-0107' } },
      { notes: { contains: 'PRD-2026-0107' } }
    ] },
    include: { material: { select: { name: true, subCategory: true, category: true } } }
  });
  console.log(JSON.stringify(moves.map(m => ({
    name: m.material?.name,
    cat: m.material?.category,
    qty: Number(m.quantity),
    type: m.type,
    ref: m.reference,
    notes: m.notes
  })), null, 2));
  await db.$disconnect();
})();
