import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { seed } from '../src/seed-data';
import { app, loginAs } from './helpers';

let data: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  data = await seed(prisma, { withAttendance: false });
});

describe('auth', () => {
  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'yonetici@kidora.app', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns the session user after login', async () => {
    const agent = await loginAs('yonetici@kidora.app');
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'ADMIN', schoolName: 'Güneş Çiçeği Kreşi' });
  });

  it('ends the session on logout', async () => {
    const agent = await loginAs('ayse@kidora.app');
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('blocks protected routes without a session', async () => {
    expect((await request(app).get('/api/children')).status).toBe(401);
  });
});

describe('access scoping', () => {
  it('admin sees every child', async () => {
    const agent = await loginAs('yonetici@kidora.app');
    const res = await agent.get('/api/children');
    expect(res.body.children).toHaveLength(data.children.length);
  });

  it('teacher only sees children in their classroom', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const res = await agent.get('/api/children');
    expect(res.body.children.length).toBe(3);
    expect(res.body.children.every((c: { classroom: { name: string } }) => c.classroom.name === 'Tırtıllar')).toBe(true);
  });

  it('parent only sees their own children and gets 404 for others', async () => {
    const agent = await loginAs('veli@kidora.app');
    const res = await agent.get('/api/children');
    expect(res.body.children.map((c: { firstName: string }) => c.firstName).sort()).toEqual(['Ada', 'Defne']);
    const other = data.children[3]!;
    expect((await agent.get(`/api/children/${other.id}`)).status).toBe(404);
  });

  it('parent cannot create children or check in', async () => {
    const agent = await loginAs('veli@kidora.app');
    const create = await agent.post('/api/children').send({ firstName: 'X', lastName: 'Y', birthDate: '2022-01-01' });
    expect(create.status).toBe(403);
    const checkIn = await agent.post('/api/attendance/check-in').send({ childId: data.children[0]!.id });
    expect(checkIn.status).toBe(403);
  });
});

describe('attendance', () => {
  it('checks a child in and out, flagging unknown pickup people', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const child = data.children[1]!;

    const inRes = await agent.post('/api/attendance/check-in').send({ childId: child.id, droppedOffBy: 'Babası' });
    expect(inRes.status).toBe(201);
    expect(inRes.body.attendance.status).toBe('PRESENT');

    expect((await agent.post('/api/attendance/check-in').send({ childId: child.id })).status).toBe(409);

    const outRes = await agent.post('/api/attendance/check-out').send({ childId: child.id, pickedUpBy: 'Yabancı Biri' });
    expect(outRes.status).toBe(200);
    expect(outRes.body.authorized).toBe(false);
    expect(outRes.body.attendance.status).toBe('CHECKED_OUT');
  });

  it('accepts an authorized pickup person regardless of case', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const child = data.children[2]!;
    await agent.post('/api/attendance/check-in').send({ childId: child.id });
    const res = await agent
      .post('/api/attendance/check-out')
      .send({ childId: child.id, pickedUpBy: `nermin ${child.lastName.toLocaleLowerCase('tr')}` });
    expect(res.body.authorized).toBe(true);
  });

  it('teacher cannot check in a child from another classroom', async () => {
    const agent = await loginAs('ayse@kidora.app');
    const res = await agent.post('/api/attendance/check-in').send({ childId: data.children[5]!.id });
    expect(res.status).toBe(404);
  });

  it('parent can report an absence for their own child', async () => {
    const agent = await loginAs('veli@kidora.app');
    const res = await agent
      .post('/api/attendance/absence')
      .send({ childId: data.children[8]!.id, date: '2030-01-02', reason: 'Doktor randevusu' });
    expect(res.status).toBe(201);
    expect(res.body.attendance.status).toBe('ABSENT');
  });

  it('dashboard counts reflect attendance', async () => {
    const agent = await loginAs('yonetici@kidora.app');
    const res = await agent.get('/api/dashboard');
    expect(res.body.kind).toBe('staff');
    expect(res.body.counts.total).toBe(data.children.length);
    expect(res.body.counts.CHECKED_OUT).toBe(2);
  });
});
