import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayKey } from '@kidora/shared';
import { prisma } from '../src/lib/prisma';
import { seed } from '../src/seed-data';
import { app, loginAs, pinClockToMidday } from './helpers';
import request from 'supertest';

let data: Awaited<ReturnType<typeof seed>>;
const [tirtil, kelebek] = [0, 1];

beforeAll(async () => {
  data = await seed(prisma, { withAttendance: false });
});

describe('teachers manage children and families', () => {
  it('teacher adds a child to their own classroom only', async () => {
    const ayse = await loginAs('ayse@kidora.app');
    const own = await ayse
      .post('/api/children')
      .send({ firstName: 'Zeren', lastName: 'Ak', birthDate: '2024-05-01', classroomId: data.rooms[tirtil]!.id });
    expect(own.status).toBe(201);
    const other = await ayse
      .post('/api/children')
      .send({ firstName: 'Zeren', lastName: 'Ak', birthDate: '2024-05-01', classroomId: data.rooms[kelebek]!.id });
    expect(other.status).toBe(403);
    const none = await ayse.post('/api/children').send({ firstName: 'Zeren', lastName: 'Ak', birthDate: '2024-05-01' });
    expect(none.status).toBe(400);
  });

  it('teacher creates a parent account that can log in and see only that child', async () => {
    const ayse = await loginAs('ayse@kidora.app');
    const child = data.children[2]!;
    const res = await ayse.post(`/api/children/${child.id}/guardians/new`).send({
      email: 'yeni.veli@kidora.app',
      password: 'gecici123',
      firstName: 'Seda',
      lastName: 'Şahin',
      relationship: 'Teyze',
    });
    expect(res.status).toBe(201);

    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: 'yeni.veli@kidora.app', password: 'gecici123' })).status).toBe(200);
    const kids = await agent.get('/api/children');
    expect(kids.body.children.map((c: { id: string }) => c.id)).toEqual([child.id]);

    // The same email cannot be used twice.
    const dup = await ayse.post(`/api/children/${child.id}/guardians/new`).send({
      email: 'yeni.veli@kidora.app',
      password: 'gecici123',
      firstName: 'X',
      lastName: 'Y',
      relationship: 'Teyze',
    });
    expect(dup.status).toBe(409);
  });

  it('a child can have several guardians and a parent several children', async () => {
    const ayse = await loginAs('ayse@kidora.app');
    const child = data.children[1]!;
    const link = await ayse.post(`/api/children/${child.id}/guardians`).send({ userId: data.demoParent.id, relationship: 'Teyze' });
    expect(link.status).toBe(201);
    const detail = await ayse.get(`/api/children/${child.id}`);
    expect(detail.body.child.guardians.length).toBe(2);

    const parent = await loginAs('veli@kidora.app');
    expect((await parent.get('/api/children')).body.children.length).toBe(3);

    expect((await ayse.delete(`/api/children/${child.id}/guardians/${data.demoParent.id}`)).status).toBe(204);
  });

  it('teacher cannot touch families outside their classroom', async () => {
    const ayse = await loginAs('ayse@kidora.app');
    const res = await ayse.post(`/api/children/${data.children[5]!.id}/guardians`).send({ userId: data.demoParent.id, relationship: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('family notices', () => {
  it('"not coming today" marks the child absent and shows on the office dashboard', async () => {
    const parent = await loginAs('veli@kidora.app');
    const child = data.children[8]!;
    await parent.post(`/api/messages/${child.id}`).send({ template: 'NOT_COMING', note: 'Ateşi var' });

    const admin = await loginAs('yonetici@kidora.app');
    const roster = await admin.get('/api/attendance');
    const entry = roster.body.roster.find((r: { child: { id: string } }) => r.child.id === child.id);
    expect(entry.attendance).toMatchObject({ status: 'ABSENT', absenceNote: 'Ateşi var' });

    const dash = await admin.get('/api/dashboard');
    expect(dash.body.familyNotices[0]).toMatchObject({ template: 'NOT_COMING', child: { id: child.id } });
  });
});

describe('parent notifications', () => {
  it('new daily entries show up unread in the bell until seen', async () => {
    const parent = await loginAs('veli@kidora.app');
    await parent.post('/api/notifications/seen');
    expect((await parent.get('/api/notifications')).body.unread).toBe(0);

    const ayse = await loginAs('ayse@kidora.app');
    await ayse.post('/api/activities').send({ childIds: [data.children[0]!.id], type: 'MOOD', data: { mood: 'HAPPY' } });

    const bell = await parent.get('/api/notifications');
    expect(bell.body.unread).toBe(1);
    expect(bell.body.items[0]).toMatchObject({ type: 'MOOD', unread: true });
    await parent.post('/api/notifications/seen');
    expect((await parent.get('/api/notifications')).body.unread).toBe(0);
  });
});

describe('medication reminders', () => {
  // Dose status depends on the time of day; Prisma's own createdAt defaults still use the real clock.
  beforeAll(pinClockToMidday);
  afterAll(() => {
    vi.useRealTimers();
  });

  it('parent adds a plan, teacher sees the dose and marks it given once', async () => {
    const parent = await loginAs('veli@kidora.app');
    const today = dayKey();
    const plan = await parent.post('/api/medications').send({
      childId: data.children[0]!.id,
      name: 'Şurup',
      dose: '5 ml',
      times: ['10:00', '00:01'],
      startDate: today,
      endDate: today,
    });
    expect(plan.status).toBe(201);
    expect(plan.body.plan.times).toEqual(['00:01', '10:00']);

    const ayse = await loginAs('ayse@kidora.app');
    let todayRes = await ayse.get('/api/medications/today');
    const early = todayRes.body.doses.find((d: { slot: string }) => d.slot === '00:01');
    expect(early.status).toBe('LATE');
    expect(todayRes.body.attention).toBeGreaterThan(0);

    const id = plan.body.plan.id;
    expect((await ayse.post(`/api/medications/${id}/give`).send({ slot: '00:01' })).status).toBe(201);
    expect((await ayse.post(`/api/medications/${id}/give`).send({ slot: '00:01' })).status).toBe(200);
    todayRes = await ayse.get('/api/medications/today');
    expect(todayRes.body.doses.find((d: { slot: string }) => d.slot === '00:01').status).toBe('GIVEN');

    const feed = await parent.get(`/api/reports/daily/${data.children[0]!.id}`);
    expect(feed.body.activities.filter((a: { type: string }) => a.type === 'MEDICATION')).toHaveLength(1);
  });

  it('parents cannot add plans for other families or mark doses', async () => {
    const parent = await loginAs('veli@kidora.app');
    const today = dayKey();
    const res = await parent
      .post('/api/medications')
      .send({ childId: data.children[4]!.id, name: 'X', dose: '1', times: ['10:00'], startDate: today, endDate: today });
    expect(res.status).toBe(404);
    const plans = await parent.get(`/api/medications/child/${data.children[0]!.id}`);
    const give = await parent.post(`/api/medications/${plans.body.plans[0].id}/give`).send({ slot: '10:00' });
    expect(give.status).toBe(403);
  });
});
