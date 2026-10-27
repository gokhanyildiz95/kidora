import { prisma } from './prisma';
import type { AuthUser } from '../middleware/auth';

export async function audit(
  user: AuthUser,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      schoolId: user.schoolId,
      userId: user.id,
      action,
      entity,
      entityId,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}
