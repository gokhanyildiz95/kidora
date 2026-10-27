import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dayKey, turkishPublicHolidays } from '@kidora/shared';
import { prisma } from '../src/lib/prisma';
import { seed } from '../src/seed-data';
import { loginAs } from './helpers';

let data: Awaited<ReturnType<typeof seed>>;
const today = dayKey();

beforeAll(async () => {
  data = await seed(prisma, { withAttendance: false });
});

afterEach(async () => {
  await prisma.holiday.deleteMany();
  await prisma.school.update({ where: { id: data.school.id }, data: { weekendsClosed: false } });
});

describe('school calendar', () => {
  it('blocks check-in and daily logging on a holiday', async () => {
    const admin = await loginAs('yonetici@kidora.app');
    const created = await admin.post('/api/calendar/holidays').send({ name: 'Ara tatil', startDate: today, endDate: today });
    expect(created.status).toBe(201);

    const teacher = await loginAs('ayse@kidora.app');
    const checkIn = await teacher.post('/api/attendance/check-in').send({ childId: data.children[0]!.id });
    expect(checkIn.status).toBe(400);
    expect(checkIn.body.error.message).toContain('Ara tatil');

    const log = await teacher.post('/api/activities').send({ childIds: [data.children[0]!.id], type: 'MOOD', data: { mood: 'HAPPY' } });
    expect(log.status).toBe(400);

    const roster = await teacher.get('/api/attendance');
    expect(roster.body.closure).toEqual({ reason: 'HOLIDAY', name: 'Ara tatil' });
  });

  it('parents see the closure and cannot report an absence for a holiday', async () => {
    const admin = await loginAs('yonetici@kidora.app');
    await admin.post('/api/calendar/holidays').send({ name: 'Yarıyıl', startDate: '2030-01-20', endDate: '2030-01-31' });
    const parent = await loginAs('veli@kidora.app');
    const res = await parent.post('/api/attendance/absence').send({ childId: data.children[0]!.id, date: '2030-01-25' });
    expect(res.status).toBe(400);
    const open = await parent.post('/api/attendance/absence').send({ childId: data.children[0]!.id, date: '2030-02-01' });
    expect(open.status).toBe(201);
  });

  it('treats weekends as closed only when the setting is on', async () => {
    const admin = await loginAs('yonetici@kidora.app');
    const parent = await loginAs('veli@kidora.app');
    const saturday = '2030-03-02';
    expect((await admin.patch('/api/calendar/settings').send({ weekendsClosed: true })).status).toBe(200);
    expect((await parent.post('/api/attendance/absence').send({ childId: data.children[8]!.id, date: saturday })).status).toBe(400);
    await admin.patch('/api/calendar/settings').send({ weekendsClosed: false });
    expect((await parent.post('/api/attendance/absence').send({ childId: data.children[8]!.id, date: saturday })).status).toBe(201);
  });

  it('adds the public holiday preset once, without duplicates', async () => {
    const admin = await loginAs('yonetici@kidora.app');
    const holidays = turkishPublicHolidays(2027);
    const first = await admin.post('/api/calendar/holidays/batch').send({ holidays });
    expect(first.body.added).toBe(holidays.length);
    const again = await admin.post('/api/calendar/holidays/batch').send({ holidays });
    expect(again.body.added).toBe(0);
  });

  it('only admins can change the calendar', async () => {
    const teacher = await loginAs('ayse@kidora.app');
    const res = await teacher.post('/api/calendar/holidays').send({ name: 'X', startDate: today, endDate: today });
    expect(res.status).toBe(403);
    expect((await teacher.get('/api/calendar')).status).toBe(200);
  });

  it('rejects a range that ends before it starts', async () => {
    const admin = await loginAs('yonetici@kidora.app');
    const res = await admin.post('/api/calendar/holidays').send({ name: 'X', startDate: '2030-05-10', endDate: '2030-05-01' });
    expect(res.status).toBe(400);
  });
});
