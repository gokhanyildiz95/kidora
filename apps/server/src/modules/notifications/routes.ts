import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { childScope } from '../../lib/scope';
import { currentUser, requireRole } from '../../middleware/auth';
import { serializeActivity } from '../activities/serialize';

export const notificationsRouter = Router();

const WINDOW_MS = 3 * 864e5;

/**
 * Parents' notification bell: what teachers logged for their children in the last few days.
 * Built from the activity feed itself, so there is no extra table to keep in sync.
 */
notificationsRouter.get('/', requireRole('PARENT'), async (req, res) => {
  const me = currentUser(req);
  const [user, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { notificationsSeenAt: true } }),
    prisma.activity.findMany({
      where: { child: childScope(me), createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { color: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);
  const seen = user.notificationsSeenAt;
  res.json({
    unread: rows.filter((a) => !seen || a.createdAt > seen).length,
    items: rows.map((a) => ({ ...serializeActivity(a), unread: !seen || a.createdAt > seen })),
  });
});

notificationsRouter.post('/seen', requireRole('PARENT'), async (req, res) => {
  const me = currentUser(req);
  await prisma.user.update({ where: { id: me.id }, data: { notificationsSeenAt: new Date() } });
  res.status(204).end();
});
