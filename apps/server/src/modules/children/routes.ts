import { Router } from 'express';
import type { Request } from 'express';
import {
  childSchema,
  dayKey,
  emergencyContactSchema,
  guardianLinkSchema,
  newGuardianSchema,
  pickupPersonSchema,
} from '@kidora/shared';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import { audit } from '../../lib/audit';
import { childScope } from '../../lib/scope';
import { currentUser, requireRole } from '../../middleware/auth';

export const childrenRouter = Router();

/** Loads a child the current user is allowed to see, or 404s (never 403, to avoid leaking ids). */
async function findVisibleChild(req: Request, id: string) {
  const child = await prisma.child.findFirst({ where: { ...childScope(currentUser(req)), id } });
  if (!child) throw notFound('Çocuk bulunamadı');
  return child;
}

/** Admins may use any classroom of the school; teachers only their own, and must pick one. */
async function assertClassroomAllowed(user: AuthUser, classroomId: string | null | undefined, required: boolean) {
  if (!classroomId) {
    if (required && user.role === 'TEACHER') throw badRequest('Sınıf seçmelisiniz');
    return;
  }
  const room = await prisma.classroom.findFirst({
    where: {
      id: classroomId,
      schoolId: user.schoolId,
      ...(user.role === 'TEACHER' ? { staff: { some: { userId: user.id } } } : {}),
    },
  });
  if (!room) throw user.role === 'TEACHER' ? forbidden('Yalnızca kendi sınıflarınıza çocuk ekleyebilirsiniz') : badRequest('Sınıf bulunamadı');
}

const staffOnly = requireRole('ADMIN', 'TEACHER');

childrenRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const classroomId = typeof req.query.classroomId === 'string' ? req.query.classroomId : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = req.query.status === 'INACTIVE' ? 'INACTIVE' : req.query.status === 'ALL' ? undefined : 'ACTIVE';
  const children = await prisma.child.findMany({
    where: {
      ...childScope(me),
      ...(classroomId ? { classroomId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] } : {}),
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    include: {
      classroom: { select: { id: true, name: true, emoji: true, color: true } },
      attendance: { where: { date: dayKey() }, take: 1 },
    },
  });
  res.json({
    children: children.map(({ attendance, ...c }) => ({ ...c, today: attendance[0] ?? null })),
  });
});

childrenRouter.get('/:id', async (req, res) => {
  const child = await findVisibleChild(req, param(req, 'id'));
  const full = await prisma.child.findUniqueOrThrow({
    where: { id: child.id },
    include: {
      classroom: { select: { id: true, name: true, emoji: true, color: true } },
      guardians: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } },
        orderBy: { isPrimary: 'desc' },
      },
      pickupPeople: { orderBy: { createdAt: 'asc' } },
      emergencyContacts: true,
      attendance: { orderBy: { date: 'desc' }, take: 14 },
    },
  });
  res.json({ child: full });
});

childrenRouter.post('/', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const data = parse(childSchema, req.body);
  await assertClassroomAllowed(me, data.classroomId, true);
  const child = await prisma.child.create({
    data: { ...data, birthDate: new Date(data.birthDate), schoolId: me.schoolId },
  });
  await audit(me, 'create', 'child', child.id);
  res.status(201).json({ child });
});

childrenRouter.patch('/:id', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const child = await findVisibleChild(req, param(req, 'id'));
  const data = parse(childSchema.partial(), req.body);
  if (data.classroomId !== undefined) await assertClassroomAllowed(me, data.classroomId, true);
  const updated = await prisma.child.update({
    where: { id: child.id },
    data: { ...data, ...(data.birthDate ? { birthDate: new Date(data.birthDate) } : {}) },
  });
  await audit(me, 'update', 'child', child.id);
  res.json({ child: updated });
});

// --- Guardians (veliler) ---

childrenRouter.post('/:id/guardians', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const child = await findVisibleChild(req, param(req, 'id'));
  const data = parse(guardianLinkSchema, req.body);
  const parent = await prisma.user.findFirst({ where: { id: data.userId, schoolId: me.schoolId, role: 'PARENT' } });
  if (!parent) throw badRequest('Veli bulunamadı');
  const link = await prisma.childGuardian.upsert({
    where: { childId_userId: { childId: child.id, userId: parent.id } },
    create: { ...data, childId: child.id },
    update: { relationship: data.relationship, isPrimary: data.isPrimary },
  });
  await audit(me, 'link', 'guardian', child.id, { userId: parent.id });
  res.status(201).json({ guardian: link });
});

/** Creates a parent account and links it to the child in one step. */
childrenRouter.post('/:id/guardians/new', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const child = await findVisibleChild(req, param(req, 'id'));
  const { relationship, isPrimary, password, ...data } = parse(newGuardianSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: data.email } })) {
    throw conflict('Bu e-posta ile bir hesap zaten var. Listeden mevcut veliyi seçin.');
  }
  const parent = await prisma.user.create({
    data: {
      ...data,
      role: 'PARENT',
      schoolId: me.schoolId,
      passwordHash: await bcrypt.hash(password, 10),
      children: { create: { childId: child.id, relationship, isPrimary } },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  await audit(me, 'create', 'user', parent.id, { role: 'PARENT', childId: child.id });
  res.status(201).json({ guardian: parent });
});

childrenRouter.delete('/:id/guardians/:userId', staffOnly, async (req, res) => {
  const me = currentUser(req);
  const child = await findVisibleChild(req, param(req, 'id'));
  await prisma.childGuardian.deleteMany({ where: { childId: child.id, userId: param(req, 'userId') } });
  await audit(me, 'unlink', 'guardian', child.id, { userId: param(req, 'userId') });
  res.status(204).end();
});

// --- Pickup people & emergency contacts: staff and the child's own parents can manage ---

const canManageContacts = requireRole('ADMIN', 'TEACHER', 'PARENT');

childrenRouter.post('/:id/pickup-people', canManageContacts, async (req, res) => {
  const child = await findVisibleChild(req, param(req, 'id'));
  const data = parse(pickupPersonSchema, req.body);
  const person = await prisma.pickupPerson.create({ data: { ...data, childId: child.id } });
  await audit(currentUser(req), 'create', 'pickupPerson', person.id, { childId: child.id });
  res.status(201).json({ pickupPerson: person });
});

childrenRouter.delete('/:id/pickup-people/:personId', canManageContacts, async (req, res) => {
  const child = await findVisibleChild(req, param(req, 'id'));
  const { count } = await prisma.pickupPerson.deleteMany({ where: { id: param(req, 'personId'), childId: child.id } });
  if (!count) throw notFound();
  await audit(currentUser(req), 'delete', 'pickupPerson', param(req, 'personId'), { childId: child.id });
  res.status(204).end();
});

childrenRouter.post('/:id/emergency-contacts', canManageContacts, async (req, res) => {
  const child = await findVisibleChild(req, param(req, 'id'));
  const data = parse(emergencyContactSchema, req.body);
  const contact = await prisma.emergencyContact.create({ data: { ...data, childId: child.id } });
  res.status(201).json({ emergencyContact: contact });
});

childrenRouter.delete('/:id/emergency-contacts/:contactId', canManageContacts, async (req, res) => {
  const child = await findVisibleChild(req, param(req, 'id'));
  const { count } = await prisma.emergencyContact.deleteMany({
    where: { id: param(req, 'contactId'), childId: child.id },
  });
  if (!count) throw notFound();
  res.status(204).end();
});
