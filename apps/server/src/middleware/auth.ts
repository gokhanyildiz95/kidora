import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@kidora/shared';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE, verifySession } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: string;
  role: Role;
  schoolId: string;
  firstName: string;
  lastName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token =
    req.cookies?.[SESSION_COOKIE] ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifySession(token);
  } catch {
    throw unauthorized('Oturumunuzun süresi doldu');
  }

  // Re-read the user so deactivated accounts and role changes take effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, schoolId: true, firstName: true, lastName: true, isActive: true },
  });
  if (!user || !user.isActive) throw unauthorized();

  req.user = { ...user, role: user.role as Role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Narrow `req.user` for handlers that run behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
