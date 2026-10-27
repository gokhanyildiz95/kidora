import { Router } from 'express';
import { PARENT_TEMPLATES, TEACHER_TEMPLATES, dayKey, sendMessageSchema, type MessageTemplate } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { badRequest, notFound } from '../../lib/errors';
import { childScope } from '../../lib/scope';
import { closureOn } from '../../lib/calendar';
import { currentUser } from '../../middleware/auth';
import { publish } from '../../lib/live';
import type { AuthUser } from '../../middleware/auth';

export const messagesRouter = Router();

const sender = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

/** Only unread messages from the last 30 days count, so the badge can't grow forever. */
const UNREAD_WINDOW_MS = 30 * 864e5;

async function unreadByChild(me: AuthUser, childIds: string[]) {
  if (childIds.length === 0) return new Map<string, number>();
  const since = new Date(Date.now() - UNREAD_WINDOW_MS);
  const [reads, incoming] = await Promise.all([
    prisma.threadRead.findMany({ where: { userId: me.id, childId: { in: childIds } } }),
    prisma.message.findMany({
      where: { childId: { in: childIds }, createdAt: { gt: since }, NOT: { senderId: me.id } },
      select: { childId: true, createdAt: true },
    }),
  ]);
  const lastRead = new Map(reads.map((r) => [r.childId, r.lastReadAt]));
  const counts = new Map<string, number>();
  for (const m of incoming) {
    const read = lastRead.get(m.childId);
    if (!read || m.createdAt > read) counts.set(m.childId, (counts.get(m.childId) ?? 0) + 1);
  }
  return counts;
}

/** Cheap endpoint the app polls for the nav badge. */
messagesRouter.get('/unread', async (req, res) => {
  const me = currentUser(req);
  const children = await prisma.child.findMany({ where: { ...childScope(me), status: 'ACTIVE' }, select: { id: true } });
  const counts = await unreadByChild(me, children.map((c) => c.id));
  res.json({ count: [...counts.values()].reduce((a, b) => a + b, 0) });
});

/** One conversation per child, newest activity first. */
messagesRouter.get('/threads', async (req, res) => {
  const me = currentUser(req);
  const children = await prisma.child.findMany({
    where: { ...childScope(me), status: 'ACTIVE' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classroom: { select: { id: true, name: true, emoji: true, color: true } },
    },
    orderBy: { firstName: 'asc' },
  });
  const ids = children.map((c) => c.id);
  const [latest, unread] = await Promise.all([
    prisma.message.findMany({
      where: { childId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      distinct: ['childId'],
      include: { sender },
    }),
    unreadByChild(me, ids),
  ]);
  const lastByChild = new Map(latest.map((m) => [m.childId, m]));
  const threads = children
    .map((child) => ({ child, lastMessage: lastByChild.get(child.id) ?? null, unread: unread.get(child.id) ?? 0 }))
    .sort((a, b) => (b.lastMessage?.createdAt.getTime() ?? 0) - (a.lastMessage?.createdAt.getTime() ?? 0));
  res.json({ threads });
});

messagesRouter.get('/:childId', async (req, res) => {
  const me = currentUser(req);
  const child = await prisma.child.findFirst({
    where: { ...childScope(me), id: param(req, 'childId') },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classroom: {
        select: { id: true, name: true, emoji: true, color: true, staff: { select: { user: { select: { firstName: true, lastName: true } } } } },
      },
      guardians: { select: { relationship: true, user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!child) throw notFound('Çocuk bulunamadı');

  const messages = await prisma.message.findMany({
    where: { childId: child.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { sender },
  });
  // Opening the conversation marks it read.
  const now = new Date();
  await prisma.threadRead.upsert({
    where: { userId_childId: { userId: me.id, childId: child.id } },
    create: { userId: me.id, childId: child.id, lastReadAt: now },
    update: { lastReadAt: now },
  });
  // Other side's read time, for a simple "görüldü" marker on our own messages.
  const otherReads = await prisma.threadRead.findMany({
    where: { childId: child.id, NOT: { userId: me.id }, user: { role: me.role === 'PARENT' ? { in: ['ADMIN', 'TEACHER'] } : 'PARENT' } },
    orderBy: { lastReadAt: 'desc' },
    take: 1,
  });

  res.json({
    child: { ...child, classroom: child.classroom && { ...child.classroom, staff: child.classroom.staff.map((s) => s.user) } },
    messages: messages.reverse(),
    seenUntil: otherReads[0]?.lastReadAt ?? null,
  });
});

messagesRouter.post('/:childId', async (req, res) => {
  const me = currentUser(req);
  const input = parse(sendMessageSchema, req.body);
  const allowed: readonly MessageTemplate[] = me.role === 'PARENT' ? PARENT_TEMPLATES : TEACHER_TEMPLATES;
  if (!allowed.includes(input.template)) throw badRequest('Bu ifade sizin rolünüz için kullanılamaz');

  const child = await prisma.child.findFirst({ where: { ...childScope(me), id: param(req, 'childId') }, select: { id: true } });
  if (!child) throw notFound('Çocuk bulunamadı');

  const message = await prisma.message.create({
    data: {
      schoolId: me.schoolId,
      childId: child.id,
      senderId: me.id,
      senderRole: me.role,
      template: input.template,
      time: input.time ?? null,
      note: input.note || null,
    },
    include: { sender },
  });
  await prisma.threadRead.upsert({
    where: { userId_childId: { userId: me.id, childId: child.id } },
    create: { userId: me.id, childId: child.id, lastReadAt: message.createdAt },
    update: { lastReadAt: message.createdAt },
  });

  // "Bugün gelmeyecek" also marks today's attendance, so teachers don't wait for the child.
  if (input.template === 'NOT_COMING') {
    const date = dayKey();
    const existing = await prisma.attendance.findUnique({ where: { childId_date: { childId: child.id, date } } });
    if (!existing && !(await closureOn(me.schoolId, date))) {
      await prisma.attendance.create({
        data: { childId: child.id, date, status: 'ABSENT', absenceNote: input.note || null },
      });
    }
  }
  publish({
    type: 'message',
    childId: child.id,
    actor: me,
    detail: { template: message.template, time: message.time, note: message.note, senderRole: me.role },
  });
  res.status(201).json({ message });
});
