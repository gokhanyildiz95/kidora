import { Router } from 'express';
import { createActivitySchema, dayKey, endNapSchema } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { publish } from '../../lib/live';
import { childScope } from '../../lib/scope';
import { currentUser, requireRole } from '../../middleware/auth';
import { serializeActivity } from './serialize';
import { assertSchoolOpen } from '../../lib/calendar';

export const activitiesRouter = Router();

const staffOnly = requireRole('ADMIN', 'TEACHER');
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Feed for a day, optionally narrowed to one child or one classroom. */
activitiesRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const date = isDay(req.query.date) ? req.query.date : dayKey();
  const childId = typeof req.query.childId === 'string' ? req.query.childId : undefined;
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : undefined;
  const activities = await prisma.activity.findMany({
    where: {
      date,
      ...(childId ? { childId } : {}),
      child: { ...childScope(me), ...(classroomId ? { classroomId } : {}) },
    },
    orderBy: { occurredAt: 'desc' },
    include: {
      child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { color: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  res.json({ date, activities: activities.map(serializeActivity) });
});

/** Logs one activity for one or many children at once (e.g. "everyone ate lunch"). */
activitiesRouter.post('/', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const input = parse(createActivitySchema, req.body);
  const children = await prisma.child.findMany({
    where: { ...childScope(me), id: { in: input.childIds }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (children.length !== new Set(input.childIds).size) throw badRequest('Bazı çocuklar bulunamadı');

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw badRequest('Gelecekteki bir saat seçilemez');
  const date = dayKey(occurredAt);
  await assertSchoolOpen(me.schoolId, date);

  const created = await prisma.$transaction(
    children.map((c) =>
      prisma.activity.create({
        data: {
          schoolId: me.schoolId,
          childId: c.id,
          date,
          type: input.type,
          occurredAt,
          data: JSON.stringify(input.data),
          note: input.note ?? null,
          createdById: me.id,
        },
        include: {
          child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { color: true } } } },
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ),
  );
  await audit(me, 'create', 'activity', undefined, { type: input.type, count: created.length });
  for (const a of created) publish({ type: 'activity', childId: a.childId, actor: me, detail: { activityType: a.type } });
  res.status(201).json({ activities: created.map(serializeActivity) });
});

/** Ends a running nap ("woke up"). */
activitiesRouter.post('/:id/end-nap', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const { endedAt } = parse(endNapSchema, req.body);
  const activity = await prisma.activity.findFirst({ where: { id: param(req, 'id'), type: 'NAP', child: childScope(me) } });
  if (!activity) throw notFound();
  const end = endedAt ? new Date(endedAt) : new Date();
  if (end <= activity.occurredAt) throw badRequest('Uyanma saati uyku başlangıcından sonra olmalı');
  const data = { ...JSON.parse(activity.data), endedAt: end.toISOString() };
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { data: JSON.stringify(data) },
    include: {
      child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { color: true } } } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  publish({ type: 'activity', childId: updated.childId, actor: me, detail: { activityType: 'NAP_END' } });
  res.json({ activity: serializeActivity(updated) });
});

/** A parent confirms they have seen an incident report. */
activitiesRouter.post('/:id/acknowledge', requireRole('PARENT'), async (req, res) => {
  const me = currentUser(req);
  const activity = await prisma.activity.findFirst({ where: { id: param(req, 'id'), child: childScope(me) } });
  if (!activity) throw notFound();
  if (activity.type !== 'INCIDENT') throw badRequest('Yalnızca olay raporları onaylanır');
  const updated = await prisma.activity.update({
    where: { id: activity.id },
    data: { acknowledgedAt: activity.acknowledgedAt ?? new Date(), acknowledgedById: activity.acknowledgedById ?? me.id },
  });
  await audit(me, 'acknowledge', 'activity', activity.id);
  publish({ type: 'activity', childId: activity.childId, actor: me, detail: { activityType: 'INCIDENT_ACK' } });
  res.json({ acknowledgedAt: updated.acknowledgedAt });
});

activitiesRouter.delete('/:id', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const activity = await prisma.activity.findFirst({ where: { id: param(req, 'id'), child: childScope(me) } });
  if (!activity) throw notFound();
  // Teachers may only remove their own entries; admins can remove any.
  if (me.role !== 'ADMIN' && activity.createdById !== me.id) throw forbidden();
  await prisma.activity.delete({ where: { id: activity.id } });
  await audit(me, 'delete', 'activity', activity.id, { type: activity.type });
  res.status(204).end();
});
