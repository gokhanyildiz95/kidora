import type { Response } from 'express';
import type { Role } from '@kidora/shared';
import type { AuthUser } from '../middleware/auth';
import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Live updates over Server-Sent Events.
 *
 * Each signed-in tab keeps one idle HTTP connection open; the server writes a small event only when
 * something happens to a child the user can see. Clients treat an event as "refetch these queries",
 * so payloads stay tiny and the REST endpoints remain the source of truth.
 *
 * Connections live in this process's memory. Running several API instances needs a shared
 * pub/sub (e.g. Redis) behind `publish` — see README "Sonraki planlar".
 */

export type LiveEventType = 'message' | 'activity' | 'attendance' | 'medication';

export interface LiveEvent {
  type: LiveEventType;
  childId: string;
  /** Who caused it; their own tabs refresh but don't show a toast. */
  actorId: string;
  actorRole: Role;
  /** Short display fields for the toast, already resolved on the server. */
  childName: string;
  actorName: string;
  /** Type-specific details (message template, activity type, attendance status…). */
  detail?: Record<string, string | null>;
}

const HEARTBEAT_MS = 25_000;
const clients = new Map<string, Set<Response>>();

export function liveStream(res: Response, user: AuthUser) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx-style proxies from buffering the stream.
    'X-Accel-Buffering': 'no',
  });
  // Ask the browser to wait 5s before reconnecting after a drop.
  res.write('retry: 5000\n\n');

  let set = clients.get(user.id);
  if (!set) clients.set(user.id, (set = new Set()));
  set.add(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  res.on('close', () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (set.size === 0) clients.delete(user.id);
  });
}

/** Number of open connections, for health checks and tests. */
export function liveConnectionCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

/** Everyone who may see this child: its guardians, its classroom's staff and the school's admins. */
export async function audienceForChild(childId: string): Promise<string[]> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: {
      schoolId: true,
      guardians: { select: { userId: true } },
      classroom: { select: { staff: { select: { userId: true } } } },
    },
  });
  if (!child) return [];
  const admins = await prisma.user.findMany({
    where: { schoolId: child.schoolId, role: 'ADMIN', isActive: true },
    select: { id: true },
  });
  return [
    ...new Set([
      ...child.guardians.map((g) => g.userId),
      ...(child.classroom?.staff.map((s) => s.userId) ?? []),
      ...admins.map((a) => a.id),
    ]),
  ];
}

/**
 * Sends an event to every open tab of everyone who may see the child.
 * Fire-and-forget: a failure here must never fail the request that caused it.
 */
export function publish(event: Omit<LiveEvent, 'childName' | 'actorName' | 'actorId' | 'actorRole'> & { actor: AuthUser }) {
  if (clients.size === 0) return;
  void (async () => {
    const [audience, child] = await Promise.all([
      audienceForChild(event.childId),
      prisma.child.findUnique({ where: { id: event.childId }, select: { firstName: true, lastName: true } }),
    ]);
    const { actor, ...rest } = event;
    const payload: LiveEvent = {
      ...rest,
      actorId: actor.id,
      actorRole: actor.role,
      childName: child ? `${child.firstName} ${child.lastName}` : '',
      actorName: `${actor.firstName} ${actor.lastName}`,
    };
    const frame = `data: ${JSON.stringify(payload)}\n\n`;
    for (const userId of audience) clients.get(userId)?.forEach((res) => res.write(frame));
  })().catch((err) => logger.warn({ err }, 'live publish failed'));
}
