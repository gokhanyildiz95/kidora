import { vi } from 'vitest';
import { dayKey } from '@kidora/shared';
import request from 'supertest';
import { createApp } from '../src/app';
import { DEMO_PASSWORD } from '../src/seed-data';

export const app = createApp();

export async function loginAs(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return agent;
}

/**
 * Freezes `Date` at noon today (Istanbul) so tests that use "an hour ago" or fixed dose times
 * don't flip to another day when the suite runs around midnight. The clock keeps ticking from there.
 */
export function pinClockToMidday() {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${dayKey()}T12:00:00+03:00`));
}
