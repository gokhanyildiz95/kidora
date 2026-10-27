import { Router } from 'express';
import { absenceSchema, checkInSchema, checkOutSchema, dayKey } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { publish } from '../../lib/live';
import { childScope } from '../../lib/scope';
import { assertSchoolOpen, closureOn } from '../../lib/calendar';
import { currentUser, requireRole } from '../../middleware/auth';
import type { AuthUser } from '../../middleware/auth';

export const attendanceRouter = Router();

const staffOnly = requireRole('ADMIN', 'TEACHER');

async function visibleChild(user: AuthUser, id: string) {
  const child = await prisma.child.findFirst({
    where: { ...childScope(user), id, status: 'ACTIVE' },
    include: { pickupPeople: true, guardians: { include: { user: true } } },
  });
  if (!child) throw notFound('Çocuk bulunamadı');
  return child;
}

/** Start of a YYYY-MM-DD day in Istanbul (UTC+3, no DST). */
const startOfDay = (date: string) => new Date(`${date}T00:00:00+03:00`);

const normalize = (s: string) => s.trim().toLocaleLowerCase('tr');

/** Daily roster: every visible active child plus today's attendance row, if any. */
attendanceRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : dayKey();
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : undefined;
  const children = await prisma.child.findMany({
    where: { ...childScope(me), status: 'ACTIVE', ...(classroomId ? { classroomId } : {}) },
    orderBy: { firstName: 'asc' },
    include: {
      classroom: { select: { id: true, name: true, emoji: true, color: true } },
      attendance: { where: { date } },
      pickupPeople: { select: { id: true, fullName: true, relationship: true } },
      guardians: { select: { relationship: true, user: { select: { firstName: true, lastName: true } } } },
      // Today's notes from the family ("geç geleceğiz", "erken alacağız"…) shown on the tile.
      messages: {
        where: { senderRole: 'PARENT', createdAt: { gte: startOfDay(date) } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, template: true, time: true, note: true, createdAt: true },
      },
    },
  });
  res.json({
    date,
    closure: await closureOn(me.schoolId, date),
    roster: children.map(({ attendance, ...child }) => ({ child, attendance: attendance[0] ?? null })),
  });
});

attendanceRouter.post('/check-in', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const data = parse(checkInSchema, req.body);
  const child = await visibleChild(me, data.childId);
  const date = dayKey();
  await assertSchoolOpen(me.schoolId, date);
  const existing = await prisma.attendance.findUnique({ where: { childId_date: { childId: child.id, date } } });
  if (existing?.status === 'PRESENT') throw conflict('Çocuk zaten giriş yapmış');

  const now = new Date();
  const fields = {
    status: 'PRESENT',
    checkInAt: now,
    checkInById: me.id,
    droppedOffBy: data.droppedOffBy ?? null,
    note: data.note ?? null,
    checkOutAt: null,
    checkOutById: null,
    pickedUpBy: null,
  };
  const attendance = await prisma.attendance.upsert({
    where: { childId_date: { childId: child.id, date } },
    create: { childId: child.id, date, ...fields },
    update: fields,
  });
  await audit(me, 'checkIn', 'attendance', attendance.id, { childId: child.id });
  publish({ type: 'attendance', childId: child.id, actor: me, detail: { status: 'PRESENT' } });
  res.status(201).json({ attendance });
});

attendanceRouter.post('/check-out', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const data = parse(checkOutSchema, req.body);
  const child = await visibleChild(me, data.childId);
  const date = dayKey();
  const existing = await prisma.attendance.findUnique({ where: { childId_date: { childId: child.id, date } } });
  if (!existing || existing.status !== 'PRESENT') throw badRequest('Çocuk bugün giriş yapmamış');

  // Flag pickups by someone who is neither a guardian nor on the authorized list.
  const allowed = [
    ...child.pickupPeople.map((p) => p.fullName),
    ...child.guardians.map((g) => `${g.user.firstName} ${g.user.lastName}`),
  ].map(normalize);
  const authorized = allowed.includes(normalize(data.pickedUpBy));

  const attendance = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      status: 'CHECKED_OUT',
      checkOutAt: new Date(),
      checkOutById: me.id,
      pickedUpBy: data.pickedUpBy,
      note: data.note ?? existing.note,
    },
  });
  await audit(me, 'checkOut', 'attendance', attendance.id, { childId: child.id, authorized });
  publish({ type: 'attendance', childId: child.id, actor: me, detail: { status: 'CHECKED_OUT', pickedUpBy: data.pickedUpBy } });
  res.json({ attendance, authorized });
});

/** Parents (for their own child) and staff can mark a day as absent in advance. */
attendanceRouter.post('/absence', async (req, res) => {
  const me = currentUser(req);
  const data = parse(absenceSchema, req.body);
  const child = await visibleChild(me, data.childId);
  await assertSchoolOpen(me.schoolId, data.date);
  const existing = await prisma.attendance.findUnique({ where: { childId_date: { childId: child.id, date: data.date } } });
  if (existing && existing.status !== 'ABSENT') throw conflict('Bu gün için zaten giriş kaydı var');
  const attendance = await prisma.attendance.upsert({
    where: { childId_date: { childId: child.id, date: data.date } },
    create: { childId: child.id, date: data.date, status: 'ABSENT', absenceNote: data.reason ?? null },
    update: { absenceNote: data.reason ?? null },
  });
  await audit(me, 'absence', 'attendance', attendance.id, { childId: child.id, date: data.date });
  publish({ type: 'attendance', childId: child.id, actor: me, detail: { status: 'ABSENT', date: data.date } });
  res.status(201).json({ attendance });
});

/** Undo a mistaken check-in/out or absence. */
attendanceRouter.delete('/:id', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const row = await prisma.attendance.findFirst({ where: { id: param(req, 'id'), child: childScope(me) } });
  if (!row) throw notFound();
  if (row.status === 'CHECKED_OUT') {
    await prisma.attendance.update({
      where: { id: row.id },
      data: { status: 'PRESENT', checkOutAt: null, checkOutById: null, pickedUpBy: null },
    });
  } else {
    await prisma.attendance.delete({ where: { id: row.id } });
  }
  await audit(me, 'undo', 'attendance', row.id, { from: row.status });
  publish({ type: 'attendance', childId: row.childId, actor: me, detail: { status: 'UNDO' } });
  res.status(204).end();
});
