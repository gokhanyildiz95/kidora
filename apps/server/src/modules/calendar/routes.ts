import { Router } from 'express';
import { dayKey, holidayBatchSchema, holidaySchema, schoolSettingsSchema } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { closureOn } from '../../lib/calendar';
import { currentUser, requireRole } from '../../middleware/auth';

export const calendarRouter = Router();

/** Holidays overlapping [from, to] plus today's closure, visible to everyone in the school. */
calendarRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const from = isDay(req.query.from) ? req.query.from : `${new Date().getFullYear()}-01-01`;
  const to = isDay(req.query.to) ? req.query.to : `${new Date().getFullYear() + 1}-12-31`;
  const [holidays, school, today] = await Promise.all([
    prisma.holiday.findMany({
      where: { schoolId: me.schoolId, startDate: { lte: to }, endDate: { gte: from } },
      orderBy: { startDate: 'asc' },
    }),
    prisma.school.findUniqueOrThrow({ where: { id: me.schoolId }, select: { weekendsClosed: true } }),
    closureOn(me.schoolId, dayKey()),
  ]);
  res.json({ holidays, weekendsClosed: school.weekendsClosed, today: { date: dayKey(), closure: today } });
});

calendarRouter.post('/holidays', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const data = parse(holidaySchema, req.body);
  const holiday = await prisma.holiday.create({ data: { ...data, schoolId: me.schoolId } });
  await audit(me, 'create', 'holiday', holiday.id, data);
  res.status(201).json({ holiday });
});

/** Adds several holidays at once (e.g. the public holiday preset), skipping exact duplicates. */
calendarRouter.post('/holidays/batch', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { holidays } = parse(holidayBatchSchema, req.body);
  const existing = await prisma.holiday.findMany({ where: { schoolId: me.schoolId }, select: { startDate: true, endDate: true } });
  const seen = new Set(existing.map((h) => `${h.startDate}|${h.endDate}`));
  const fresh = holidays.filter((h) => !seen.has(`${h.startDate}|${h.endDate}`));
  if (fresh.length) {
    await prisma.holiday.createMany({ data: fresh.map((h) => ({ ...h, schoolId: me.schoolId })) });
    await audit(me, 'create', 'holiday', undefined, { count: fresh.length });
  }
  res.status(201).json({ added: fresh.length });
});

calendarRouter.delete('/holidays/:id', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { count } = await prisma.holiday.deleteMany({ where: { id: param(req, 'id'), schoolId: me.schoolId } });
  if (!count) throw notFound();
  await audit(me, 'delete', 'holiday', param(req, 'id'));
  res.status(204).end();
});

calendarRouter.patch('/settings', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const data = parse(schoolSettingsSchema, req.body);
  await prisma.school.update({ where: { id: me.schoolId }, data });
  await audit(me, 'update', 'school', me.schoolId, data);
  res.json(data);
});
