import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { seed } from '../src/seed-data';
import { loginAs } from './helpers';

let data: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  data = await seed(prisma, { withAttendance: false });
});

describe('messages', () => {
  it('parent sends a ready phrase, teacher sees it unread, opening marks it read', async () => {
    const parent = await loginAs('veli@kidora.app');
    const child = data.children[0]!;
    const sent = await parent.post(`/api/messages/${child.id}`).send({ template: 'EARLY_PICKUP', time: '15:30' });
    expect(sent.status).toBe(201);

    const teacher = await loginAs('ayse@kidora.app');
    expect((await teacher.get('/api/messages/unread')).body.count).toBe(1);
    const threads = await teacher.get('/api/messages/threads');
    expect(threads.body.threads[0]).toMatchObject({ child: { id: child.id }, unread: 1, lastMessage: { template: 'EARLY_PICKUP', time: '15:30' } });

    const convo = await teacher.get(`/api/messages/${child.id}`);
    expect(convo.body.messages).toHaveLength(1);
    expect((await teacher.get('/api/messages/unread')).body.count).toBe(0);

    // The parent's own message never counts as unread for them, and they see it was seen.
    expect((await parent.get('/api/messages/unread')).body.count).toBe(0);
    const parentView = await parent.get(`/api/messages/${child.id}`);
    expect(parentView.body.seenUntil).not.toBeNull();
  });

  it("shows today's family notes on the attendance roster", async () => {
    const teacher = await loginAs('ayse@kidora.app');
    const roster = await teacher.get('/api/attendance');
    const entry = roster.body.roster.find((r: { child: { id: string } }) => r.child.id === data.children[0]!.id);
    expect(entry.child.messages[0].template).toBe('EARLY_PICKUP');
  });

  it('teachers and parents each use only their own phrases', async () => {
    const parent = await loginAs('veli@kidora.app');
    const teacher = await loginAs('ayse@kidora.app');
    const id = data.children[0]!.id;
    expect((await parent.post(`/api/messages/${id}`).send({ template: 'NEEDS_DIAPERS' })).status).toBe(400);
    expect((await teacher.post(`/api/messages/${id}`).send({ template: 'LATE_TODAY' })).status).toBe(400);
    expect((await teacher.post(`/api/messages/${id}`).send({ template: 'NEEDS_DIAPERS', note: 'Islak mendil de' })).status).toBe(201);
  });

  it('requires a note for "other" and a timed phrase for a time', async () => {
    const parent = await loginAs('veli@kidora.app');
    const id = data.children[0]!.id;
    expect((await parent.post(`/api/messages/${id}`).send({ template: 'OTHER' })).status).toBe(400);
    expect((await parent.post(`/api/messages/${id}`).send({ template: 'THANKS', time: '10:00' })).status).toBe(400);
    expect((await parent.post(`/api/messages/${id}`).send({ template: 'OTHER', note: 'Yarın doğum günü pastası getireceğiz' })).status).toBe(201);
  });

  it("nobody can read or write another family's conversation", async () => {
    const parent = await loginAs('veli@kidora.app');
    const other = data.children[4]!.id;
    expect((await parent.get(`/api/messages/${other}`)).status).toBe(404);
    expect((await parent.post(`/api/messages/${other}`).send({ template: 'THANKS' })).status).toBe(404);
    const ayse = await loginAs('ayse@kidora.app');
    expect((await ayse.get(`/api/messages/${other}`)).status).toBe(404);
  });
});
