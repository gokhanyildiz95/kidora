import i18n from '../i18n';
import { ageInMonths } from '@kidora/shared';

const locale = () => (i18n.language === 'en' ? 'en-GB' : 'tr-TR');

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Date(iso).toLocaleDateString(locale(), opts);
}

export function formatAge(birthDate: string): string {
  const months = ageInMonths(birthDate);
  return months < 24
    ? i18n.t('common.months', { count: months })
    : i18n.t('common.years', { count: Math.floor(months / 12) });
}

export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

export function greetingKey(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'greeting.morning' : h < 18 ? 'greeting.afternoon' : 'greeting.evening';
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
