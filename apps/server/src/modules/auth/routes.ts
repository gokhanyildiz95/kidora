import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { loginSchema, type Role, type SessionUser } from '@kidora/shared';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { unauthorized } from '../../lib/errors';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from '../../lib/jwt';
import { isProd } from '../../lib/env';
import { currentUser, requireAuth } from '../../middleware/auth';

export const authRouter = Router();

async function loadSessionUser(id: string): Promise<SessionUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id }, include: { school: true } });
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role as Role,
    schoolId: u.schoolId,
    schoolName: u.school.name,
    locale: u.locale,
  };
}

authRouter.post('/login', async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  // Compare even when the user is missing so response time doesn't reveal which emails exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinv');
  if (!user || !ok || !user.isActive) throw unauthorized('E-posta veya şifre hatalı');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = signSession({ sub: user.id, role: user.role as Role, schoolId: user.schoolId });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
  res.json({ user: await loadSessionUser(user.id), token });
});

authRouter.post('/logout', (_req, res) => {
  // Must match the options used when the cookie was set, or browsers keep it.
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await loadSessionUser(currentUser(req).id) });
});
