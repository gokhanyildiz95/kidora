import jwt from 'jsonwebtoken';
import type { Role } from '@kidora/shared';
import { env } from './env';

export interface TokenPayload {
  sub: string;
  role: Role;
  schoolId: string;
}

export const SESSION_COOKIE = 'kidora_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signSession(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
