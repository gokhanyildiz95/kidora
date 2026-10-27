import { Router } from 'express';
import { dayKey } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { childScope, classroomScope } from '../../lib/scope';
import { currentUser } from '../../middleware/auth';
import { closureOn } from '../../lib/calendar';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const me = currentUser(req);
  const today = dayKey();
  const closure = await closureOn(me.schoolId, today);

  if (me.role === 'PARENT') {
    const children = await prisma.child.findMany({
      where: { ...childScope(me), status: 'ACTIVE' },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            emoji: true,
            color: true,
            staff: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
        },
        attendance: { where: { date: today } },
      },
    });
    res.json({
      kind: 'parent',
      date: today,
      closure,
      children: children.map(({ attendance, classroom, ...c }) => ({
        ...c,
        classroom: classroom && { ...classroom, staff: classroom.staff.map((s) => s.user) },
        today: attendance[0] ?? null,
      })),
    });
    return;
  }

  const [children, rooms, recent, familyNotices] = await Promise.all([
    prisma.child.findMany({
      where: { ...childScope(me), status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        allergies: true,
        classroomId: true,
        attendance: { where: { date: today }, select: { status: true } },
      },
    }),
    prisma.classroom.findMany({
      where: classroomScope(me),
      orderBy: { name: 'asc' },
      select: { id: true, name: true, emoji: true, color: true, capacity: true, ratio: true, _count: { select: { staff: true } } },
    }),
    prisma.attendance.findMany({
      where: { date: today, child: childScope(me), status: { in: ['PRESENT', 'CHECKED_OUT'] } },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { child: { select: { id: true, firstName: true, lastName: true } } },
    }),
    // Today's arrival/pickup notes from families, so the office sees them too.
    prisma.message.findMany({
      where: { senderRole: 'PARENT', createdAt: { gte: new Date(`${today}T00:00:00+03:00`) }, child: childScope(me) },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        template: true,
        time: true,
        note: true,
        createdAt: true,
        child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { name: true, emoji: true } } } },
        sender: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const statusOf = (c: (typeof children)[number]) => c.attendance[0]?.status ?? 'NOT_ARRIVED';
  const counts = { total: children.length, PRESENT: 0, CHECKED_OUT: 0, ABSENT: 0, NOT_ARRIVED: 0 };
  for (const c of children) counts[statusOf(c) as keyof typeof counts]++;

  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 864e5);
  const birthdays = children
    .map((c) => {
      const b = new Date(c.birthDate);
      let next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        next = new Date(now.getFullYear() + 1, b.getMonth(), b.getDate());
      }
      return { id: c.id, firstName: c.firstName, lastName: c.lastName, date: next, turning: next.getFullYear() - b.getFullYear() };
    })
    .filter((b) => b.date <= inAWeek)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  res.json({
    kind: 'staff',
    date: today,
    closure,
    counts,
    classrooms: rooms.map(({ _count, ...r }) => {
      const present = children.filter((c) => c.classroomId === r.id && statusOf(c) === 'PRESENT').length;
      const enrolled = children.filter((c) => c.classroomId === r.id).length;
      // Staff needed to keep the configured child:staff ratio.
      const staffNeeded = Math.ceil(present / r.ratio);
      return { ...r, present, enrolled, staffCount: _count.staff, staffNeeded, ratioOk: _count.staff >= staffNeeded };
    }),
    allergiesPresent: children
      .filter((c) => c.allergies && statusOf(c) === 'PRESENT')
      .map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, allergies: c.allergies })),
    birthdays,
    recent,
    familyNotices,
  });
});
