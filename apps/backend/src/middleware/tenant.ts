import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from './auth'
import { AppError } from './errorHandler'
import { prisma } from '../database'
import { runWithTenant } from '../context'

export interface TenantRequest extends AuthenticatedRequest {
  tenant?: {
    id: string
    slug: string
    name: string
  }
}

export async function tenantMiddleware(req: TenantRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) {
    next()
    return
  }

  if (req.user.role === 'SUPER_ADMIN') {
    next()
    return
  }

  const tenantId = (req.user as any).tenantId
  if (!tenantId) {
    throw new AppError(400, 'TENANT_REQUIRED', 'No tenant associated with this user')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, isActive: true },
  })

  if (!tenant || !tenant.isActive) {
    throw new AppError(403, 'TENANT_INACTIVE', 'Your organization is inactive or not found')
  }

  req.tenant = { id: tenant.id, slug: tenant.slug, name: tenant.name }

  runWithTenant(tenant.id, () => {
    next()
  })
}
