import 'dotenv/config'
import { createApp } from './app'
import { logger } from './logger'
import { prisma } from './database'

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development'
}

const PORT = process.env.PORT || 3000

const app = createApp()

async function seedInitialData() {
  const { PrismaClient } = await import('@prisma/client')
  const { default: bcrypt } = await import('bcryptjs')
  
  const adminExists = await prisma.user.findUnique({
    where: { username: 'admin' }
  })

  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
    if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
      throw new Error('ADMIN_PASSWORD environment variable is required in production')
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        role: 'ADMIN'
      }
    })
    logger.info('Created default admin user (username: admin)')
  }
}

async function start() {
  try {
    await prisma.$connect()
    logger.info('Database connected')

    await seedInitialData()

    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server started')
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server')
    process.exit(1)
  }
}

start()

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})
