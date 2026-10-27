import type { HolidayInput } from './schemas';

/**
 * Turkish public holidays, offered to admins as a one-click preset.
 * Religious holidays follow the Diyanet calendar and should be double-checked each year.
 */
const fixed = (year: number): HolidayInput[] => [
  { name: 'Yılbaşı', startDate: `${year}-01-01`, endDate: `${year}-01-01` },
  { name: 'Ulusal Egemenlik ve Çocuk Bayramı', startDate: `${year}-04-23`, endDate: `${year}-04-23` },
  { name: 'Emek ve Dayanışma Günü', startDate: `${year}-05-01`, endDate: `${year}-05-01` },
  { name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", startDate: `${year}-05-19`, endDate: `${year}-05-19` },
  { name: 'Demokrasi ve Milli Birlik Günü', startDate: `${year}-07-15`, endDate: `${year}-07-15` },
  { name: 'Zafer Bayramı', startDate: `${year}-08-30`, endDate: `${year}-08-30` },
  { name: 'Cumhuriyet Bayramı', startDate: `${year}-10-29`, endDate: `${year}-10-29` },
];

const religious: Record<number, HolidayInput[]> = {
  2026: [
    { name: 'Ramazan Bayramı', startDate: '2026-03-20', endDate: '2026-03-22' },
    { name: 'Kurban Bayramı', startDate: '2026-05-27', endDate: '2026-05-30' },
  ],
  2027: [
    { name: 'Ramazan Bayramı', startDate: '2027-03-09', endDate: '2027-03-11' },
    { name: 'Kurban Bayramı', startDate: '2027-05-16', endDate: '2027-05-19' },
  ],
};

export const PUBLIC_HOLIDAY_YEARS = Object.keys(religious).map(Number);

export function turkishPublicHolidays(year: number): HolidayInput[] {
  return [...fixed(year), ...(religious[year] ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
