import { PrismaClient } from '@prisma/client'
import pino from 'pino'

const logger = pino({ name: 'database' })

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' }
    ]
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

prisma.$connect()
  .then(() => {
    logger.info('Database connected successfully')
  })
  .catch((error) => {
    logger.error({ err: error }, 'Failed to connect to database')
  })

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
