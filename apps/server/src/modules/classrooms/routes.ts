import { Router } from 'express';
import { classroomSchema, dayKey } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { classroomScope } from '../../lib/scope';
import { currentUser, requireRole } from '../../middleware/auth';

export const classroomsRouter = Router();

classroomsRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const today = dayKey();
  const rooms = await prisma.classroom.findMany({
    where: classroomScope(me),
    orderBy: { name: 'asc' },
    include: {
      staff: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      _count: { select: { children: { where: { status: 'ACTIVE' } } } },
    },
  });
  const present = await prisma.attendance.findMany({
    where: { date: today, status: 'PRESENT', child: { classroomId: { in: rooms.map((r) => r.id) } } },
    select: { child: { select: { classroomId: true } } },
  });
  const presentByRoom = new Map<string, number>();
  for (const { child } of present) {
    if (child.classroomId) presentByRoom.set(child.classroomId, (presentByRoom.get(child.classroomId) ?? 0) + 1);
  }

  res.json({
    classrooms: rooms.map((r) => ({
      ...r,
      staff: r.staff.map((s) => s.user),
      childCount: r._count.children,
      presentCount: presentByRoom.get(r.id) ?? 0,
      _count: undefined,
    })),
  });
});

classroomsRouter.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const room = await prisma.classroom.findFirst({
    where: { ...classroomScope(me), id: param(req, 'id') },
    include: {
      staff: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!room) throw notFound();
  res.json({ classroom: { ...room, staff: room.staff.map((s) => s.user) } });
});

classroomsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const data = parse(classroomSchema, req.body);
  const classroom = await prisma.classroom.create({ data: { ...data, schoolId: me.schoolId } });
  await audit(me, 'create', 'classroom', classroom.id);
  res.status(201).json({ classroom });
});

classroomsRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const data = parse(classroomSchema.partial(), req.body);
  const { count } = await prisma.classroom.updateMany({
    where: { id: param(req, 'id'), schoolId: me.schoolId },
    data,
  });
  if (!count) throw notFound();
  await audit(me, 'update', 'classroom', param(req, 'id'));
  res.json({ classroom: await prisma.classroom.findUnique({ where: { id: param(req, 'id') } }) });
});

classroomsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { count } = await prisma.classroom.deleteMany({ where: { id: param(req, 'id'), schoolId: me.schoolId } });
  if (!count) throw notFound();
  await audit(me, 'delete', 'classroom', param(req, 'id'));
  res.status(204).end();
});
