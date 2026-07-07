const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const r = await db.$queryRawUnsafe(
    "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_name IN ('Stock','StockMovement') AND column_name='quantity'"
  );
  console.log('Current column types:', JSON.stringify(r));

  // Try a direct test with a material with NO existing movements (clean test)
  const testMat = await db.material.findFirst({ where: { subCategory: 'SkyBlue-Ink' } });
  if (!testMat) { console.log('SkyBlue-Ink not found'); return; }

  const stock = await db.stock.findFirst({ where: { materialId: testMat.id, location: 'MAIN' } });
  const beforeQty = stock ? Number(stock.quantity) : 0;
  console.log('SkyBlue-Ink stock before:', beforeQty);

  // Create movement directly
  const mov = await db.stockMovement.create({
    data: {
      materialId: testMat.id,
      stockId: stock?.id || '',
      type: 'OUT',
      quantity: 0.7,
      reference: 'TEST-FLOAT'
    }
  });
  // Read it back fresh
  const readMov = await db.stockMovement.findUnique({ where: { id: mov.id } });
  console.log('Stored quantity:', Number(readMov.quantity));
  console.log('Stored as string:', readMov.quantity);
  console.log('typeof:', typeof readMov.quantity);
  console.log('Exact check:', readMov.quantity === 0.7 ? 'PASS ✅' : 'FAIL ❌');
  console.log('Within epsilon:', Math.abs(Number(readMov.quantity) - 0.7) < 0.001 ? 'PASS ✅' : 'FAIL ❌');

  // Cleanup
  await db.stockMovement.delete({ where: { id: mov.id } });
  console.log('Cleaned up');

  await db.$disconnect();
})();
