import { prisma } from './prisma';
import { badRequest } from './errors';

export type Closure = { reason: 'HOLIDAY'; name: string } | { reason: 'WEEKEND'; name: null } | null;

/** Why the school is closed on `date` (YYYY-MM-DD), or null when it is open. */
export async function closureOn(schoolId: string, date: string): Promise<Closure> {
  const holiday = await prisma.holiday.findFirst({
    where: { schoolId, startDate: { lte: date }, endDate: { gte: date } },
    orderBy: { startDate: 'asc' },
  });
  if (holiday) return { reason: 'HOLIDAY', name: holiday.name };

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { weekendsClosed: true } });
  // Noon UTC keeps the weekday stable regardless of the server's time zone.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (school?.weekendsClosed && (weekday === 0 || weekday === 6)) return { reason: 'WEEKEND', name: null };
  return null;
}

export async function assertSchoolOpen(schoolId: string, date: string) {
  const closure = await closureOn(schoolId, date);
  if (closure) {
    throw badRequest(closure.reason === 'HOLIDAY' ? `Okul bu gün tatil: ${closure.name}` : 'Okul hafta sonu kapalı', {
      closure,
    });
  }
}
