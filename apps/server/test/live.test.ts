import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { prisma } from '../src/lib/prisma';
import { audienceForChild, liveConnectionCount } from '../src/lib/live';
import { DEMO_PASSWORD, seed } from '../src/seed-data';
import { app, loginAs } from './helpers';

let data: Awaited<ReturnType<typeof seed>>;
let server: Server;
let base: string;

beforeAll(async () => {
  data = await seed(prisma, { withAttendance: false });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  return new Promise<void>((done) => server.close(() => done()));
});

async function cookieFor(email: string) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

/** Opens the event stream and resolves with the first data event. */
async function openStream(email: string) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { headers: { cookie: await cookieFor(email) }, signal: controller.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const next = async () => {
    let buffer = '';
    for (;;) {
      const { value } = await reader.read();
      buffer += decoder.decode(value, { stream: true });
      const line = buffer.split('\n').find((l) => l.startsWith('data: '));
      if (line) return JSON.parse(line.slice(6));
    }
  };
  return { res, next, close: () => controller.abort() };
}

describe('live events', () => {
  it('pushes a parent message to the classroom teacher straight away', async () => {
    const teacher = await openStream('ayse@kidora.app');
    expect(teacher.res.headers.get('content-type')).toContain('text/event-stream');

    const child = data.children[0]!;
    const parent = await loginAs('veli@kidora.app');
    const event = teacher.next();
    await parent.post(`/api/messages/${child.id}`).send({ template: 'LATE_TODAY', time: '10:00' });

    expect(await event).toMatchObject({
      type: 'message',
      childId: child.id,
      actorId: data.demoParent.id,
      detail: { template: 'LATE_TODAY', time: '10:00' },
    });
    teacher.close();
  });

  it('sends events only to people who can see the child', async () => {
    const audience = await audienceForChild(data.children[0]!.id);
    const users = await prisma.user.findMany({ where: { id: { in: audience } }, select: { email: true } });
    const emails = users.map((u) => u.email);
    expect(emails).toEqual(expect.arrayContaining(['ayse@kidora.app', 'yonetici@kidora.app', 'veli@kidora.app']));
    expect(emails).not.toContain('mehmet@kidora.app');
  });

  it('rejects the stream without a session and frees closed connections', async () => {
    expect((await fetch(`${base}/api/events`)).status).toBe(401);
    const stream = await openStream('yonetici@kidora.app');
    expect(liveConnectionCount()).toBeGreaterThan(0);
    stream.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(liveConnectionCount()).toBe(0);
  });
});
