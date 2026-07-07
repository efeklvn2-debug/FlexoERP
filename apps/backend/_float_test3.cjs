const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  // Get a material + stock to test with
  const mat = await db.material.findFirst({ where: { subCategory: 'SkyBlue-Ink' } });
  const stk = await db.stock.findFirst({ where: { materialId: mat.id, location: 'MAIN' } });
  const beforeStk = stk ? Number(stk.quantity) : 0;

  // Insert via raw SQL to bypass any Prisma type mapping
  await db.$executeRawUnsafe(
    'INSERT INTO "StockMovement" ("id", "materialId", "stockId", "type", "quantity", "reference", "notes") VALUES ($1, $2, $3, $4, $5, $6, $7)',
    'test-float-' + Date.now(), mat.id, stk.id, 'OUT', 1.5, 'TEST-FLOAT', 'Raw SQL test of 1.5'
  );

  // Read back via raw SQL
  const rows = await db.$queryRawUnsafe(
    "SELECT id, quantity::text FROM \"StockMovement\" WHERE reference = 'TEST-FLOAT'"
  );

  // Also try via Prisma
  const prismaMov = await db.stockMovement.findFirst({ where: { reference: 'TEST-FLOAT' } });

  console.log('Raw SQL read:', JSON.stringify(rows));
  console.log('Prisma read:', prismaMov ? { id: prismaMov.id, qty: Number(prismaMov.quantity) } : null);

  // Cleanup
  if (prismaMov) await db.stockMovement.delete({ where: { id: prismaMov.id } });

  await db.$disconnect();
})();
