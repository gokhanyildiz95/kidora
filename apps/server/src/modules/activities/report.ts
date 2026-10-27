import { Router } from 'express';
import { dayKey } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { childScope } from '../../lib/scope';
import { currentUser } from '../../middleware/auth';
import { serializeActivity } from './serialize';

export const reportsRouter = Router();

/** Everything that happened to one child on one day, plus a summary for the parent. */
reportsRouter.get('/daily/:childId', async (req, res) => {
  const me = currentUser(req);
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : dayKey();
  const child = await prisma.child.findFirst({
    where: { ...childScope(me), id: param(req, 'childId') },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      allergies: true,
      classroom: { select: { id: true, name: true, emoji: true, color: true } },
    },
  });
  if (!child) throw notFound('Çocuk bulunamadı');

  const [attendance, rows] = await Promise.all([
    prisma.attendance.findUnique({ where: { childId_date: { childId: child.id, date } } }),
    prisma.activity.findMany({
      where: { childId: child.id, date },
      orderBy: { occurredAt: 'asc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const activities = rows.map(serializeActivity);

  let napMinutes = 0;
  const meals: Array<{ meal: string; amount: string }> = [];
  let toilets = 0;
  let mood: string | null = null;
  for (const a of activities) {
    if (a.type === 'NAP' && typeof a.data.endedAt === 'string') {
      napMinutes += Math.round((new Date(a.data.endedAt).getTime() - a.occurredAt.getTime()) / 60_000);
    }
    if (a.type === 'MEAL') meals.push({ meal: String(a.data.meal), amount: String(a.data.amount) });
    if (a.type === 'TOILET') toilets++;
    if (a.type === 'MOOD') mood = String(a.data.mood);
  }

  res.json({
    date,
    child,
    attendance,
    activities,
    summary: {
      napMinutes,
      meals,
      toilets,
      mood,
      incidents: activities.filter((a) => a.type === 'INCIDENT').length,
      unacknowledgedIncidents: activities.filter((a) => a.type === 'INCIDENT' && !a.acknowledgedAt).length,
    },
  });
});
