import type { z } from 'zod';
import { badRequest } from './errors';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Geçersiz veri', result.error.issues);
  }
  return result.data;
}

/** Route params as a plain string (Express 5 types them as string | string[]). */
export function param(req: { params: Record<string, string | string[] | undefined> }, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !value) throw badRequest(`Eksik parametre: ${name}`);
  return value;
}
