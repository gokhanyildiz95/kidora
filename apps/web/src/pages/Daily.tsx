import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import { ACTIVITY_TYPES, MEALS, MEAL_AMOUNTS, MOODS, TOILET_KINDS, type ActivityType } from '@kidora/shared';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatTime, fullName } from '../lib/format';
import type { Activity, Classroom, Closure, RosterEntry } from '../lib/types';
import { ClosedBanner } from '../components/ClosedBanner';
import { Avatar, Button, EmptyState, Field, FormError, PageHeader, Spinner, cx } from '../components/ui';
import { ActivityIcon, TypeButton, moodEmoji, useDescribe } from '../components/activity';

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayAt(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

const defaults: Record<ActivityType, Record<string, string>> = {
  MEAL: { meal: 'LUNCH', amount: 'ALL', items: '' },
  NAP: {},
  TOILET: { kind: 'WET' },
  MOOD: { mood: 'HAPPY' },
  MEDICATION: { name: '', dose: '' },
  INCIDENT: { description: '', actionTaken: '', bodyPart: '' },
  PLAY: { title: '' },
  NOTE: {},
};

export function DailyPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const classroomId = params.get('classroom') ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<ActivityType>('MEAL');
  const [fields, setFields] = useState<Record<string, string>>(defaults.MEAL);
  const [time, setTime] = useState(nowHHMM());
  const [note, setNote] = useState('');

  const rooms = useQuery({ queryKey: ['classrooms'], queryFn: () => api.get<{ classrooms: Classroom[] }>('/classrooms') });
  const roster = useQuery({
    queryKey: ['attendance', classroomId],
    queryFn: () => api.get<{ closure: Closure; roster: RosterEntry[] }>(`/attendance${classroomId ? `?classroomId=${classroomId}` : ''}`),
  });
  const feed = useQuery({
    queryKey: ['activities', classroomId],
    queryFn: () => api.get<{ activities: Activity[] }>(`/activities${classroomId ? `?classroomId=${classroomId}` : ''}`),
    refetchInterval: 120_000,
  });

  const present = (roster.data?.roster ?? []).filter((r) => r.attendance?.status === 'PRESENT');

  const save = useMutation({
    mutationFn: () => {
      const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === '' ? null : v]));
      return api.post('/activities', { childIds: [...selected], type, occurredAt: todayAt(time), data, note: note || null });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activities'] });
      void qc.invalidateQueries({ queryKey: ['report'] });
      setSelected(new Set());
      setNote('');
      setFields(defaults[type]);
      setTime(nowHHMM());
    },
  });

  const pickType = (next: ActivityType) => {
    setType(next);
    setFields(defaults[next]);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader title={t('daily.title')} subtitle={t('daily.subtitle')} />
      <ClosedBanner closure={roster.data?.closure ?? null} />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <RoomChip active={!classroomId} color="#FF7A59" onClick={() => setParams({})}>
          🌈 {t('attendance.allClassrooms')}
        </RoomChip>
        {rooms.data?.classrooms.map((r) => (
          <RoomChip key={r.id} active={classroomId === r.id} color={r.color} onClick={() => setParams({ classroom: r.id })}>
            {r.emoji} {r.name}
          </RoomChip>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold">{t('daily.selectChildren')}</h2>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(present.map((r) => r.child.id)))}>
                {t('daily.selectAllPresent')}
              </Button>
              {selected.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  {t('daily.clear')}
                </Button>
              )}
            </div>
          </div>
          {roster.isLoading ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
              {roster.data?.roster.map(({ child, attendance }) => {
                const on = selected.has(child.id);
                const here = attendance?.status === 'PRESENT';
                return (
                  <button
                    key={child.id}
                    onClick={() => toggle(child.id)}
                    className={cx(
                      'relative flex flex-col items-center gap-1 rounded-3xl p-2.5 text-sm font-extrabold ring-2 transition',
                      on ? 'bg-coral-soft ring-coral' : 'bg-cream ring-transparent',
                      !here && !on && 'opacity-50',
                    )}
                    aria-pressed={on}
                  >
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-coral text-white">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                    <Avatar name={fullName(child)} size={48} color={child.classroom?.color} />
                    <span className="leading-tight">{child.firstName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <form
          className="card space-y-4 lg:col-span-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="text-xl font-extrabold">{t('daily.chooseType')}</h2>
          <div className="grid grid-cols-4 gap-2">
            {ACTIVITY_TYPES.map((tp) => (
              <TypeButton key={tp} type={tp} active={type === tp} onClick={() => pickType(tp)} />
            ))}
          </div>

          <TypeFields type={type} fields={fields} onChange={(k, v) => setFields((f) => ({ ...f, [k]: v }))} />

          <div className="grid grid-cols-3 gap-3">
            <Field label={type === 'NAP' ? t('daily.fields.napStart') : t('daily.time')}>
              <input className="input" type="time" value={time} max={nowHHMM()} onChange={(e) => setTime(e.target.value)} required />
            </Field>
            <div className="col-span-2">
              <Field label={type === 'NOTE' ? t('daily.note') : `${t('daily.note')} (${t('common.optional')})`}>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} required={type === 'NOTE'} />
              </Field>
            </div>
          </div>
          <FormError error={save.error} />
          <Button type="submit" size="lg" className="w-full" disabled={selected.size === 0 || save.isPending || !!roster.data?.closure}>
            {selected.size === 0 ? t('daily.selectChildren') : t('daily.save', { count: selected.size })}
          </Button>
        </form>
      </div>

      <h2 className="mb-3 mt-10 text-2xl font-extrabold">{t('daily.feed')}</h2>
      {feed.isLoading ? <Spinner /> : <Feed activities={feed.data?.activities ?? []} />}
    </>
  );
}

function RoomChip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ring-2 transition', active ? 'text-white' : 'bg-white text-ink-soft ring-line')}
      style={active ? { background: color, boxShadow: `0 0 0 2px ${color}` } : undefined}
    >
      {children}
    </button>
  );
}

function Choice({ options, value, onChange, label }: { options: Array<{ id: string; label: string }>; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cx('rounded-full px-3.5 py-2 text-sm font-extrabold ring-2 transition', value === o.id ? 'bg-ink text-white ring-ink' : 'bg-white ring-line')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TypeFields({ type, fields, onChange }: { type: ActivityType; fields: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const { t } = useTranslation();
  const text = (key: string, label: string, required = true, area = false) => (
    <Field label={required ? label : `${label} (${t('common.optional')})`}>
      {area ? (
        <textarea className="input min-h-20" required={required} value={fields[key] ?? ''} onChange={(e) => onChange(key, e.target.value)} />
      ) : (
        <input className="input" required={required} value={fields[key] ?? ''} onChange={(e) => onChange(key, e.target.value)} />
      )}
    </Field>
  );
  switch (type) {
    case 'MEAL':
      return (
        <>
          <Choice label={t('daily.fields.meal')} value={fields.meal!} onChange={(v) => onChange('meal', v)} options={MEALS.map((m) => ({ id: m, label: t(`daily.meals.${m}`) }))} />
          <Choice label={t('daily.fields.amount')} value={fields.amount!} onChange={(v) => onChange('amount', v)} options={MEAL_AMOUNTS.map((m) => ({ id: m, label: t(`daily.amounts.${m}`) }))} />
          {text('items', t('daily.fields.items'), false)}
        </>
      );
    case 'TOILET':
      return <Choice label={t('daily.fields.kind')} value={fields.kind!} onChange={(v) => onChange('kind', v)} options={TOILET_KINDS.map((k) => ({ id: k, label: t(`daily.toiletKinds.${k}`) }))} />;
    case 'MOOD':
      return (
        <Choice
          label={t('daily.fields.mood')}
          value={fields.mood!}
          onChange={(v) => onChange('mood', v)}
          options={MOODS.map((m) => ({ id: m, label: `${moodEmoji[m]} ${t(`daily.moods.${m}`)}` }))}
        />
      );
    case 'MEDICATION':
      return (
        <div className="grid grid-cols-2 gap-3">
          {text('name', t('daily.fields.medName'))}
          {text('dose', t('daily.fields.dose'))}
        </div>
      );
    case 'INCIDENT':
      return (
        <>
          {text('description', t('daily.fields.description'), true, true)}
          {text('actionTaken', t('daily.fields.actionTaken'), true, true)}
          {text('bodyPart', t('daily.fields.bodyPart'), false)}
        </>
      );
    case 'PLAY':
      return text('title', t('daily.fields.title'));
    default:
      return null;
  }
}

export function Feed({ activities, showChild = true }: { activities: Activity[]; showChild?: boolean }) {
  const { t } = useTranslation();
  const user = useUser();
  const qc = useQueryClient();
  const describe = useDescribe();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['activities'] });
    void qc.invalidateQueries({ queryKey: ['report'] });
  };

  if (activities.length === 0) return <EmptyState emoji="📒" text={t('daily.feedEmpty')} />;
  return (
    <ul className="card divide-y divide-line p-2">
      {activities.map((a) => {
        const canDelete = user.role === 'ADMIN' || a.createdById === user.id;
        const napRunning = a.type === 'NAP' && !a.data.endedAt;
        return (
          <li key={a.id} className="flex items-start gap-3 px-3 py-3">
            <ActivityIcon type={a.type} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">
                {showChild && a.child && (
                  <Link to={`/children/${a.child.id}/report`} className="hover:text-coral">
                    {fullName(a.child)} ·{' '}
                  </Link>
                )}
                <span className="text-ink-soft">{t(`daily.types.${a.type}`)}</span>
              </p>
              <p className="text-sm">{describe(a)}</p>
              {a.type !== 'NOTE' && a.note && <p className="text-sm italic text-ink-soft">“{a.note}”</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-sm font-extrabold text-ink-soft">{formatTime(a.occurredAt)}</span>
              {napRunning && user.role !== 'PARENT' && (
                <Button size="sm" variant="secondary" onClick={() => void api.post(`/activities/${a.id}/end-nap`).then(refresh)}>
                  ☀️ {t('daily.endNap')}
                </Button>
              )}
              {canDelete && user.role !== 'PARENT' && (
                <button onClick={() => void api.delete(`/activities/${a.id}`).then(refresh)} className="rounded-full p-1.5 text-muted hover:bg-rose-soft hover:text-[#b83a62]" aria-label={t('common.delete')}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
