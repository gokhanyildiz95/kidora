import { Router } from 'express';
import { dayKey, giveMedicationSchema, medicationPlanSchema } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { param, parse } from '../../lib/validate';
import { notFound } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { publish } from '../../lib/live';
import { childScope } from '../../lib/scope';
import { assertSchoolOpen } from '../../lib/calendar';
import { currentUser, requireRole } from '../../middleware/auth';

export const medicationsRouter = Router();

/** Minutes after the scheduled time before a dose counts as late. */
const LATE_AFTER_MIN = 30;
/** Minutes before the scheduled time when a dose shows up as "due". */
const DUE_BEFORE_MIN = 30;

/** Current HH:MM in Istanbul. */
function nowHHMM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * Today's doses for every visible child with an active plan, each marked
 * GIVEN, LATE, DUE (within the next half hour or just passed) or UPCOMING.
 */
medicationsRouter.get('/today', async (req, res) => {
  const me = currentUser(req);
  const today = dayKey();
  const plans = await prisma.medicationPlan.findMany({
    where: { child: { ...childScope(me), status: 'ACTIVE' }, startDate: { lte: today }, endDate: { gte: today } },
    include: { child: { select: { id: true, firstName: true, lastName: true, classroom: { select: { color: true, name: true } } } } },
  });
  const given = await prisma.activity.findMany({
    where: { date: today, type: 'MEDICATION', childId: { in: plans.map((p) => p.childId) } },
    select: { data: true, occurredAt: true, createdBy: { select: { firstName: true, lastName: true } } },
  });
  const givenBySlot = new Map<string, (typeof given)[number]>();
  for (const g of given) {
    const d = JSON.parse(g.data) as { planId?: string; slot?: string };
    if (d.planId && d.slot) givenBySlot.set(`${d.planId}|${d.slot}`, g);
  }

  const now = toMin(nowHHMM());
  const doses = plans
    .flatMap((plan) =>
      plan.times.split(',').map((slot) => {
        const g = givenBySlot.get(`${plan.id}|${slot}`);
        const diff = toMin(slot) - now;
        const status = g ? 'GIVEN' : diff < -LATE_AFTER_MIN ? 'LATE' : diff <= DUE_BEFORE_MIN ? 'DUE' : 'UPCOMING';
        return {
          planId: plan.id,
          slot,
          status,
          name: plan.name,
          dose: plan.dose,
          instructions: plan.instructions,
          child: plan.child,
          givenAt: g?.occurredAt ?? null,
          givenBy: g?.createdBy ?? null,
        };
      }),
    )
    .sort((a, b) => a.slot.localeCompare(b.slot));

  res.json({
    date: today,
    doses,
    // Teachers get a banner for anything that needs doing now.
    attention: doses.filter((d) => d.status === 'DUE' || d.status === 'LATE').length,
  });
});

medicationsRouter.get('/child/:childId', async (req, res) => {
  const me = currentUser(req);
  const child = await prisma.child.findFirst({ where: { ...childScope(me), id: param(req, 'childId') }, select: { id: true } });
  if (!child) throw notFound('Çocuk bulunamadı');
  const plans = await prisma.medicationPlan.findMany({ where: { childId: child.id }, orderBy: { startDate: 'desc' } });
  res.json({ plans: plans.map((p) => ({ ...p, times: p.times.split(',') })) });
});

/** Staff, or the child's own parent (that is the parent's written authorization), add a plan. */
medicationsRouter.post('/', async (req, res) => {
  const me = currentUser(req);
  const { times, ...data } = parse(medicationPlanSchema, req.body);
  const child = await prisma.child.findFirst({ where: { ...childScope(me), id: data.childId }, select: { id: true } });
  if (!child) throw notFound('Çocuk bulunamadı');
  const plan = await prisma.medicationPlan.create({
    data: {
      ...data,
      instructions: data.instructions || null,
      times: [...new Set(times)].sort().join(','),
      schoolId: me.schoolId,
      createdById: me.id,
      createdRole: me.role,
    },
  });
  await audit(me, 'create', 'medicationPlan', plan.id, { childId: child.id });
  res.status(201).json({ plan: { ...plan, times: plan.times.split(',') } });
});

medicationsRouter.delete('/:id', async (req, res) => {
  const me = currentUser(req);
  const plan = await prisma.medicationPlan.findFirst({ where: { id: param(req, 'id'), child: childScope(me) } });
  if (!plan) throw notFound();
  await prisma.medicationPlan.delete({ where: { id: plan.id } });
  await audit(me, 'delete', 'medicationPlan', plan.id);
  res.status(204).end();
});

/** "Verildi": logs the dose in the child's daily feed, which also notifies the parents. */
medicationsRouter.post('/:id/give', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  const me = currentUser(req);
  const { slot, note } = parse(giveMedicationSchema, req.body);
  const today = dayKey();
  const plan = await prisma.medicationPlan.findFirst({
    where: { id: param(req, 'id'), child: childScope(me), startDate: { lte: today }, endDate: { gte: today } },
  });
  if (!plan || !plan.times.split(',').includes(slot)) throw notFound('Bu saat için ilaç planı yok');
  await assertSchoolOpen(me.schoolId, today);

  // Pressing "Verildi" twice (or from two devices) must not log the dose twice.
  const loggedToday = await prisma.activity.findMany({
    where: { childId: plan.childId, date: today, type: 'MEDICATION' },
    select: { id: true, data: true },
  });
  const already = loggedToday.find((a) => {
    const d = JSON.parse(a.data) as { planId?: string; slot?: string };
    return d.planId === plan.id && d.slot === slot;
  });
  if (already) {
    res.json({ activityId: already.id });
    return;
  }
  const activity = await prisma.activity.create({
    data: {
      schoolId: me.schoolId,
      childId: plan.childId,
      date: today,
      type: 'MEDICATION',
      occurredAt: new Date(),
      data: JSON.stringify({ name: plan.name, dose: plan.dose, planId: plan.id, slot }),
      note: note || null,
      createdById: me.id,
    },
  });
  await audit(me, 'give', 'medicationPlan', plan.id, { slot });
  publish({ type: 'medication', childId: plan.childId, actor: me, detail: { name: plan.name, dose: plan.dose, slot } });
  res.status(201).json({ activityId: activity.id });
});
