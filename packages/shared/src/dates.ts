/** Returns the calendar day (YYYY-MM-DD) of `date` in the given IANA time zone. */
export function dayKey(date: Date = new Date(), timeZone = 'Europe/Istanbul'): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Age in whole months, used for infant/toddler groups. */
export function ageInMonths(birthDate: Date | string, now: Date = new Date()): number {
  const b = new Date(birthDate);
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  if (now.getDate() < b.getDate()) months -= 1;
  return Math.max(0, months);
}
