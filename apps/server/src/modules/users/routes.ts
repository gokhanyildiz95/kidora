import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ROLES, createUserSchema, updateUserSchema, type Role } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { currentUser, requireRole } from '../../middleware/auth';

export const usersRouter = Router();

const publicUser = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  classrooms: { select: { classroom: { select: { id: true, name: true, emoji: true, color: true } } } },
  children: { select: { relationship: true, child: { select: { id: true, firstName: true, lastName: true } } } },
} as const;

usersRouter.get('/', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  const me = currentUser(req);
  const role = typeof req.query.role === 'string' && ROLES.includes(req.query.role as Role) ? req.query.role : undefined;
  const users = await prisma.user.findMany({
    where: { schoolId: me.schoolId, ...(role ? { role } : {}) },
    select: publicUser,
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
  });
  res.json({ users });
});

usersRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { password, classroomIds, ...data } = parse(createUserSchema, req.body);
  const user = await prisma.user.create({
    data: {
      ...data,
      schoolId: me.schoolId,
      passwordHash: await bcrypt.hash(password, 10),
      classrooms: classroomIds?.length
        ? { create: await ownClassrooms(me.schoolId, classroomIds) }
        : undefined,
    },
    select: publicUser,
  });
  await audit(me, 'create', 'user', user.id, { role: user.role });
  res.status(201).json({ user });
});

usersRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const existing = await prisma.user.findFirst({ where: { id: param(req, 'id'), schoolId: me.schoolId } });
  if (!existing) throw notFound();
  const { password, classroomIds, ...data } = parse(updateUserSchema, req.body);

  const user = await prisma.$transaction(async (tx) => {
    if (classroomIds) {
      await tx.classroomStaff.deleteMany({ where: { userId: existing.id } });
      await tx.classroomStaff.createMany({
        data: (await ownClassrooms(me.schoolId, classroomIds)).map((c) => ({ ...c, userId: existing.id })),
      });
    }
    return tx.user.update({
      where: { id: existing.id },
      data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select: publicUser,
    });
  });
  await audit(me, 'update', 'user', user.id);
  res.json({ user });
});

/** Keeps only classroom ids that belong to the school, so users can't be attached across schools. */
async function ownClassrooms(schoolId: string, ids: string[]) {
  const rooms = await prisma.classroom.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true } });
  return rooms.map((r) => ({ classroomId: r.id }));
}
