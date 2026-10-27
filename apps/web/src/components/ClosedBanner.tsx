import { useTranslation } from 'react-i18next';
import type { Closure } from '../lib/types';

export function ClosedBanner({ closure }: { closure: Closure }) {
  const { t } = useTranslation();
  if (!closure) return null;
  return (
    <div className="mb-6 flex items-center gap-4 rounded-[2rem] bg-sky-soft px-5 py-4 ring-2 ring-sky/30">
      <span className="text-4xl" aria-hidden>
        {closure.reason === 'HOLIDAY' ? '🏖️' : '🛋️'}
      </span>
      <div>
        <p className="text-lg font-extrabold">
          {closure.reason === 'HOLIDAY' ? t('calendar.closedToday', { name: closure.name }) : t('calendar.closedWeekend')}
        </p>
        <p className="text-sm font-semibold text-ink-soft">{t('calendar.closedHint')}</p>
      </div>
    </div>
  );
}
