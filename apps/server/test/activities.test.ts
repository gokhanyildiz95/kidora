import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { seed } from '../src/seed-data';
import { loginAs, pinClockToMidday } from './helpers';

let data: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  pinClockToMidday();
  data = await seed(prisma, { withAttendance: false });
});

afterAll(() => {
  vi.useRealTimers();
});

describe('daily activities', () => {
  it('logs one meal for a whole group at once', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const ids = data.children.slice(0, 3).map((c) => c.id);
    const res = await agent
      .post('/api/activities')
      .send({ childIds: ids, type: 'MEAL', data: { meal: 'LUNCH', amount: 'MOST', items: 'Mercimek çorbası' } });
    expect(res.status).toBe(201);
    expect(res.body.activities).toHaveLength(3);
    expect(res.body.activities[0].data.meal).toBe('LUNCH');
  });

  it('rejects data that does not match the activity type', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const res = await agent
      .post('/api/activities')
      .send({ childIds: [data.children[0]!.id], type: 'MEAL', data: { amount: 'LOTS' } });
    expect(res.status).toBe(400);
  });

  it('refuses children outside the teacher classroom', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const res = await agent
      .post('/api/activities')
      .send({ childIds: [data.children[0]!.id, data.children[5]!.id], type: 'MOOD', data: { mood: 'HAPPY' } });
    expect(res.status).toBe(400);
  });

  it('parents cannot log activities', async () => {
    const agent = await loginAs('veli@kidora.app');
    const res = await agent.post('/api/activities').send({ childIds: [data.children[0]!.id], type: 'MOOD', data: { mood: 'HAPPY' } });
    expect(res.status).toBe(403);
  });

  it('tracks a nap and reports its length in the daily summary', async () => {
    const teacher = await loginAs('ayse@kidora.app');
    const child = data.children[0]!;
    const start = new Date(Date.now() - 90 * 60_000);
    const nap = await teacher.post('/api/activities').send({ childIds: [child.id], type: 'NAP', occurredAt: start.toISOString(), data: {} });
    const napId = nap.body.activities[0].id;
    const end = new Date(start.getTime() + 75 * 60_000);
    expect((await teacher.post(`/api/activities/${napId}/end-nap`).send({ endedAt: end.toISOString() })).status).toBe(200);

    const parent = await loginAs('veli@kidora.app');
    const report = await parent.get(`/api/reports/daily/${child.id}`);
    expect(report.status).toBe(200);
    expect(report.body.summary.napMinutes).toBe(75);
    expect(report.body.summary.meals).toEqual([{ meal: 'LUNCH', amount: 'MOST' }]);
  });

  it('parent acknowledges an incident report', async () => {
    const teacher = await loginAs('ayse@kidora.app');
    const child = data.children[0]!;
    const incident = await teacher.post('/api/activities').send({
      childIds: [child.id],
      type: 'INCIDENT',
      data: { description: 'Düştü', actionTaken: 'Buz uygulandı' },
    });
    const id = incident.body.activities[0].id;

    const parent = await loginAs('veli@kidora.app');
    let report = await parent.get(`/api/reports/daily/${child.id}`);
    expect(report.body.summary.unacknowledgedIncidents).toBe(1);
    expect((await parent.post(`/api/activities/${id}/acknowledge`)).status).toBe(200);
    report = await parent.get(`/api/reports/daily/${child.id}`);
    expect(report.body.summary.unacknowledgedIncidents).toBe(0);
  });

  it('parent cannot read another family report', async () => {
    const parent = await loginAs('veli@kidora.app');
    expect((await parent.get(`/api/reports/daily/${data.children[4]!.id}`)).status).toBe(404);
  });

  it('admins can delete entries made by any teacher', async () => {
    const mehmet = await loginAs('mehmet@kidora.app');
    const created = await mehmet.post('/api/activities').send({ childIds: [data.children[3]!.id], type: 'MOOD', data: { mood: 'CALM' } });
    const admin = await loginAs('yonetici@kidora.app');
    expect((await admin.delete(`/api/activities/${created.body.activities[0].id}`)).status).toBe(204);
  });
});
