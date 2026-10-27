import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, formatTime, fullName, todayIso } from '../lib/format';
import type { Activity, DailyReport } from '../lib/types';
import { Avatar, Button, EmptyState, ErrorBox, Spinner, StatusPill } from '../components/ui';
import { ActivityIcon, activityMeta, moodEmoji, useDescribe, useDuration } from '../components/activity';

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

export function useDailyReport(childId: string, date: string) {
  return useQuery({
    queryKey: ['report', childId, date],
    queryFn: () => api.get<DailyReport>(`/reports/daily/${childId}?date=${date}`),
    refetchInterval: date === todayIso() ? 120_000 : false,
  });
}

export function DailyReportPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayIso();
  const query = useDailyReport(id!, date);
  const duration = useDuration();
  const isToday = date === todayIso();

  if (query.isLoading) return <Spinner />;
  if (query.error) return <ErrorBox error={query.error} />;
  const report = query.data!;
  const { summary, child } = report;
  const color = child.classroom?.color ?? '#FF7A59';
  const incidents = report.activities.filter((a) => a.type === 'INCIDENT');
  const timeline = report.activities.filter((a) => a.type !== 'INCIDENT');

  return (
    <>
      <Link to={user.role === 'PARENT' ? '/' : `/children/${child.id}`} className="mb-4 inline-flex items-center gap-1 font-extrabold text-ink-soft hover:text-coral">
        <ArrowLeft size={18} /> {user.role === 'PARENT' ? t('nav.dashboard') : fullName(child)}
      </Link>

      <header className="mb-6 rounded-[2.5rem] p-6" style={{ background: `linear-gradient(135deg, ${color}33, ${color}0d)` }}>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={fullName(child)} size={72} color={color} className="ring-4 ring-white" />
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="text-2xl font-extrabold md:text-3xl">{t('daily.reportTitle', { name: child.firstName })}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink-soft">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              <StatusPill status={report.attendance?.status ?? 'NOT_ARRIVED'} />
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="secondary" size="sm" onClick={() => setParams({ date: shiftDay(date, -1) })} aria-label={t('daily.prevDay')}>
              <ChevronLeft size={18} />
            </Button>
            <Button variant="secondary" size="sm" disabled={isToday} onClick={() => setParams({ date: shiftDay(date, 1) })} aria-label={t('daily.nextDay')}>
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile emoji="😴" color={activityMeta.NAP.color} label={t('daily.summary.nap')} value={summary.napMinutes ? duration(summary.napMinutes) : '—'} />
        <SummaryTile emoji="🍎" color={activityMeta.MEAL.color} label={t('daily.summary.meals')} value={String(summary.meals.length)} />
        <SummaryTile emoji="🧷" color={activityMeta.TOILET.color} label={t('daily.summary.toilets')} value={String(summary.toilets)} />
        <SummaryTile
          emoji={summary.mood ? (moodEmoji[summary.mood] ?? '😊') : '😊'}
          color={activityMeta.MOOD.color}
          label={t('daily.summary.mood')}
          value={summary.mood ? t(`daily.moods.${summary.mood}`) : '—'}
        />
      </div>

      {incidents.map((a) => (
        <IncidentCard key={a.id} activity={a} childId={child.id} date={date} />
      ))}

      {timeline.length === 0 && incidents.length === 0 ? <EmptyState emoji="📒" text={t('daily.reportEmpty')} /> : <Timeline activities={timeline} />}
    </>
  );
}

function SummaryTile({ emoji, color, label, value }: { emoji: string; color: string; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex size-12 items-center justify-center rounded-2xl text-2xl" style={{ background: `${color}26` }}>
        {emoji}
      </span>
      <div>
        <p className="font-display text-xl font-extrabold leading-tight">{value}</p>
        <p className="text-xs font-bold text-ink-soft">{label}</p>
      </div>
    </div>
  );
}

function Timeline({ activities }: { activities: Activity[] }) {
  const { t } = useTranslation();
  const describe = useDescribe();
  return (
    <ol className="relative ml-6 space-y-4 border-l-4 border-dashed border-line pl-8">
      {activities.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[3.35rem] top-2">
            <ActivityIcon type={a.type} size={40} />
          </span>
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-extrabold">{t(`daily.types.${a.type}`)}</p>
              <span className="text-sm font-extrabold text-muted">{formatTime(a.occurredAt)}</span>
            </div>
            <p className="mt-0.5">{describe(a)}</p>
            {a.type !== 'NOTE' && a.note && <p className="mt-1 text-sm italic text-ink-soft">“{a.note}”</p>}
            {a.createdBy && <p className="mt-2 text-xs font-bold text-muted">{t('daily.by', { name: fullName(a.createdBy) })}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function IncidentCard({ activity, childId, date }: { activity: Activity; childId: string; date: string }) {
  const { t } = useTranslation();
  const user = useUser();
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: () => api.post(`/activities/${activity.id}/acknowledge`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['report', childId, date] }),
  });
  const d = activity.data;
  return (
    <section className="card mb-4 border-l-8 border-rose bg-rose-soft/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          🩹 {t('daily.types.INCIDENT')} · {formatTime(activity.occurredAt)}
        </h2>
        {activity.acknowledgedAt ? (
          <span className="rounded-full bg-mint-soft px-3 py-1 text-xs font-extrabold text-[#1f7a5c]">✓ {t('daily.acknowledged')}</span>
        ) : (
          <span className="rounded-full bg-sun-soft px-3 py-1 text-xs font-extrabold text-[#9a6a00]">{t('daily.needsAck')}</span>
        )}
      </div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="label">{t('daily.fields.description')}</dt>
          <dd>{d.description}</dd>
        </div>
        <div>
          <dt className="label">{t('daily.fields.actionTaken')}</dt>
          <dd>{d.actionTaken}</dd>
        </div>
        {d.bodyPart && (
          <div>
            <dt className="label">{t('daily.fields.bodyPart')}</dt>
            <dd>{d.bodyPart}</dd>
          </div>
        )}
      </dl>
      {user.role === 'PARENT' && !activity.acknowledgedAt && (
        <Button className="mt-4" onClick={() => ack.mutate()} disabled={ack.isPending}>
          {t('daily.acknowledge')}
        </Button>
      )}
    </section>
  );
}
