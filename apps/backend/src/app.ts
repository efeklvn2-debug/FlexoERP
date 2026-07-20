import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import { authRouter } from './modules/auth'
import { healthRouter } from './modules/health'
import { inventoryRouter } from './modules/inventory'
import { procurementRouter } from './modules/procurement'
import { supplierRouter } from './modules/suppliers'
import { settingsRouter } from './modules/settings'
import { productionRouter } from './modules/production'
import { transactionRouter } from './modules/transactions'
import { pricingRouter } from './modules/pricing'
import { financeRouter } from './modules/finance'
import { salesOrderRouter } from './modules/salesOrders'
import { reportsRouter } from './modules/reports'
import { honeypotMiddleware } from './middleware/honeypot'
import { idempotencyMiddleware } from './middleware/idempotency'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { logger } from './logger'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

  app.use(honeypotMiddleware)

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }))
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", process.env.CORS_ORIGIN || 'http://localhost:5173'].filter(Boolean),
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      }
    }
  }))
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
  })
  app.use('/api', limiter)

  app.use(idempotencyMiddleware)

  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/inventory', inventoryRouter)
  app.use('/api/procurement', procurementRouter)
  app.use('/api/suppliers', supplierRouter)
  app.use('/api/production', productionRouter)
  app.use('/api/transactions', transactionRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/pricing', pricingRouter)
  app.use('/api/finance', financeRouter)
  app.use('/api/sales-orders', salesOrderRouter)
  app.use('/api/reports', reportsRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  logger.info('Express app configured')

  return app
}
