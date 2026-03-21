import { Request, Response, NextFunction } from 'express'
import { prisma } from '../database'
import { createChildLogger } from '../logger'

const logger = createChildLogger('idempotency')

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const idempotencyKey = req.headers['idempotency-key'] as string

  if (!idempotencyKey) {
    next()
    return
  }

  if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    next()
    return
  }

  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { id: idempotencyKey }
    })

    if (existing) {
      logger.info({ key: idempotencyKey }, 'Returning cached response for idempotent request')
      res.status(200).json(existing.response)
      return
    }

    const originalJson = res.json.bind(res)
    res.json = function (body: unknown) {
      prisma.idempotencyKey.create({
        data: {
          id: idempotencyKey,
          response: body
        }
      }).catch((err) => {
        logger.error({ err, key: idempotencyKey }, 'Failed to cache idempotent response')
      })
      return originalJson(body)
    }

    next()
  } catch (error) {
    logger.error({ err: error, key: idempotencyKey }, 'Error in idempotency middleware')
    next(error)
  }
}
