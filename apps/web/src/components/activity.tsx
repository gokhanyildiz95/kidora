import { useTranslation } from 'react-i18next';
import type { ActivityType } from '@kidora/shared';
import type { Activity } from '../lib/types';
import { formatTime } from '../lib/format';
import { cx } from './ui';

export const activityMeta: Record<ActivityType, { emoji: string; color: string }> = {
  MEAL: { emoji: '🍎', color: '#FF7A59' },
  NAP: { emoji: '😴', color: '#9B8CFF' },
  TOILET: { emoji: '🧷', color: '#5AB4F0' },
  MOOD: { emoji: '😊', color: '#FFC94D' },
  MEDICATION: { emoji: '💊', color: '#4CBF98' },
  INCIDENT: { emoji: '🩹', color: '#FF8FB1' },
  PLAY: { emoji: '🎨', color: '#7BC67E' },
  NOTE: { emoji: '📝', color: '#8A8292' },
};

export const moodEmoji: Record<string, string> = { HAPPY: '😄', CALM: '😌', TIRED: '🥱', SAD: '😢', FUSSY: '😣' };

export function napDuration(a: Activity): number | null {
  if (a.type !== 'NAP' || !a.data.endedAt) return null;
  return Math.round((new Date(a.data.endedAt).getTime() - new Date(a.occurredAt).getTime()) / 60_000);
}

export function useDuration() {
  const { t } = useTranslation();
  return (minutes: number) => t('daily.summary.napValue', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

/** One-line human description of an activity, e.g. "Öğle yemeği · Çoğunu yedi". */
export function useDescribe() {
  const { t } = useTranslation();
  const duration = useDuration();
  return (a: Activity): string => {
    const d = a.data;
    switch (a.type) {
      case 'MEAL':
        return [t(`daily.meals.${d.meal}`), t(`daily.amounts.${d.amount}`), d.items].filter(Boolean).join(' · ');
      case 'NAP': {
        const mins = napDuration(a);
        return mins === null
          ? t('daily.describe.NAP_RUNNING')
          : `${t('daily.describe.NAP_DONE', { duration: duration(mins) })} (${formatTime(a.occurredAt)}–${formatTime(d.endedAt)})`;
      }
      case 'TOILET':
        return t(`daily.toiletKinds.${d.kind}`);
      case 'MOOD':
        return `${moodEmoji[d.mood ?? ''] ?? ''} ${t(`daily.moods.${d.mood}`)}`;
      case 'MEDICATION':
        return t('daily.describe.MEDICATION', { name: d.name, dose: d.dose });
      case 'INCIDENT':
        return d.description ?? '';
      case 'PLAY':
        return d.title ?? '';
      case 'NOTE':
        return a.note ?? '';
    }
  };
}

export function ActivityIcon({ type, size = 44 }: { type: ActivityType; size?: number }) {
  const meta = activityMeta[type];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, background: `${meta.color}26`, fontSize: size * 0.5 }}
      aria-hidden
    >
      {meta.emoji}
    </span>
  );
}

export function TypeButton({ type, active, onClick }: { type: ActivityType; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const meta = activityMeta[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex flex-col items-center gap-1.5 rounded-3xl bg-white px-2 py-3 text-sm font-extrabold ring-2 transition', !active && 'ring-line hover:-translate-y-0.5')}
      style={active ? { boxShadow: `0 0 0 3px ${meta.color}`, background: `${meta.color}1a` } : undefined}
    >
      <span className="text-3xl">{meta.emoji}</span>
      {t(`daily.types.${type}`)}
    </button>
  );
}
