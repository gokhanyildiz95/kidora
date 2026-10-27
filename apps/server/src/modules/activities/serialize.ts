import type { Activity } from '@prisma/client';

export function serializeActivity<T extends Activity>(a: T) {
  return { ...a, data: JSON.parse(a.data) as Record<string, unknown> };
}
