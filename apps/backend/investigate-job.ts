import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const JOB_NUMBER = 'PRD-2026-0087';

async function main() {
  console.log('='.repeat(80));
  console.log(`INVESTIGATION FOR PRODUCTION JOB: ${JOB_NUMBER}`);
  console.log('='.repeat(80));

  // 1. The production job record (full object)
  console.log('\n--- 1. PRODUCTION JOB RECORD ---');
  const job = await prisma.productionJob.findUnique({
    where: { jobNumber: JOB_NUMBER },
  });
  if (!job) {
    console.log(`ERROR: Production job "${JOB_NUMBER}" not found.`);
    return;
  }
  console.log(JSON.stringify(job, null, 2));

  // 2. All printed rolls for this job (with roll details)
  console.log('\n--- 2. PRINTED ROLLS (with Roll details) ---');
  const printedRolls = await prisma.printedRoll.findMany({
    where: { productionJobId: job.id },
    include: { roll: true },
  });
  console.log(JSON.stringify(printedRolls, null, 2));

  // 3. All parent rolls referenced via printedRoll.roll
  console.log('\n--- 3. PARENT ROLLS (via PrintedRoll > Roll) ---');
  const parentRolls = printedRolls.map(pr => pr.roll);
  console.log(JSON.stringify(parentRolls, null, 2));

  // 4. The sales order linked to this job (if any)
  console.log('\n--- 4. SALES ORDER ---');
  if (job.salesOrderId) {
    const salesOrder = await prisma.salesOrder.findUnique({
      where: { id: job.salesOrderId },
    });
    console.log(JSON.stringify(salesOrder, null, 2));
  } else {
    console.log('No sales order linked to this job.');
  }

  // 5. All journal entries with sourceModule='PRODUCTION' and sourceId matching job id
  console.log('\n--- 5. JOURNAL ENTRIES (sourceModule=PRODUCTION, sourceId=job.id) ---');
  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      sourceModule: 'PRODUCTION',
      sourceId: job.id,
    },
    include: { lines: true },
  });
  if (journalEntries.length === 0) {
    // Also try matching by reference containing job number
    console.log('No journal entries with exact sourceModule/sourceId match. Trying reference match...');
    const refMatch = await prisma.journalEntry.findMany({
      where: {
        reference: { contains: job.jobNumber },
      },
      include: { lines: true },
    });
    if (refMatch.length > 0) {
      console.log('Found journal entries by reference:');
      console.log(JSON.stringify(refMatch, null, 2));
    } else {
      console.log('No journal entries found for this job by any criteria.');
    }
  } else {
    console.log(JSON.stringify(journalEntries, null, 2));
  }

  // 6. All stock movements with reference matching job's jobNumber
  console.log('\n--- 6. STOCK MOVEMENTS (reference contains jobNumber) ---');
  const stockMovements = await prisma.stockMovement.findMany({
    where: {
      reference: { contains: job.jobNumber },
    },
    include: { material: true },
  });
  if (stockMovements.length === 0) {
    console.log('No stock movements found with reference containing job number.');
  } else {
    console.log(JSON.stringify(stockMovements, null, 2));
  }

  // 7. All roll records with status 'IN_PRODUCTION'
  console.log('\n--- 7. ROLLS WITH STATUS IN_PRODUCTION ---');
  const inProductionRolls = await prisma.roll.findMany({
    where: { status: 'IN_PRODUCTION' },
  });
  if (inProductionRolls.length === 0) {
    console.log('No rolls currently in IN_PRODUCTION status.');
  } else {
    console.log(JSON.stringify(inProductionRolls, null, 2));
  }

  // 8. Raw SQL check on the actual database for the ProductionJob table columns
  console.log('\n--- 8. RAW SQL: ProductionJob columns / raw job row ---');
  const rawJobRow = await prisma.$queryRawUnsafe(
    `SELECT * FROM "ProductionJob" WHERE "jobNumber" = $1`,
    JOB_NUMBER
  );
  console.log('Raw ProductionJob row:');
  console.log(JSON.stringify(rawJobRow, null, 2));

  // Also check the PrintedRoll table for this job
  console.log('\n--- RAW SQL: PrintedRoll rows for this job ---');
  const rawPrintedRolls = await prisma.$queryRawUnsafe(
    `SELECT * FROM "PrintedRoll" WHERE "productionJobId" = $1`,
    job.id
  );
  console.log(JSON.stringify(rawPrintedRolls, null, 2));

  // Check column info for ProductionJob
  console.log('\n--- RAW SQL: ProductionJob column definitions ---');
  const columns = await prisma.$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'ProductionJob'
     ORDER BY ordinal_position`
  );
  console.log(JSON.stringify(columns, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('INVESTIGATION COMPLETE');
  console.log('='.repeat(80));
}

main()
  .catch((e) => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
