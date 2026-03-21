import { Request, Response, NextFunction } from 'express'
import { checkDatabaseConnection } from '../../database'
import { logger } from '../../logger'

const startTime = Date.now()

export const healthController = {
  async check(req: Request, res: Response, next: NextFunction) {
    try {
      const dbConnected = await checkDatabaseConnection()
      
      res.status(dbConnected ? 200 : 503).json({
        data: {
          status: dbConnected ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          database: dbConnected ? 'connected' : 'disconnected'
        }
      })
    } catch (error) {
      logger.error({ err: error }, 'Health check failed')
      res.status(503).json({
        data: {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - startTime) / 1000),
          database: 'disconnected'
        }
      })
    }
  }
}
