import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LogIn, LogOut, Undo2 } from 'lucide-react';
import type { AttendanceStatus } from '@kidora/shared';
import { api } from '../lib/api';
import { formatTime, fullName } from '../lib/format';
import type { Classroom, Closure, RosterEntry } from '../lib/types';
import { ClosedBanner } from '../components/ClosedBanner';
import { useMessageText } from './Messages';
import { Avatar, Button, EmptyState, ErrorBox, Field, FormError, Modal, PageHeader, Spinner, StatusPill, cx } from '../components/ui';

const tileStyles: Record<AttendanceStatus, string> = {
  PRESENT: 'ring-mint bg-mint-soft/60',
  CHECKED_OUT: 'ring-sky/50 bg-sky-soft/50 opacity-80',
  ABSENT: 'ring-rose/50 bg-rose-soft/40 opacity-75',
  NOT_ARRIVED: 'ring-line bg-white',
};

export function AttendancePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const classroomId = params.get('classroom') ?? '';
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const messageText = useMessageText();

  const rooms = useQuery({ queryKey: ['classrooms'], queryFn: () => api.get<{ classrooms: Classroom[] }>('/classrooms') });
  const roster = useQuery({
    queryKey: ['attendance', classroomId],
    queryFn: () => api.get<{ date: string; closure: Closure; roster: RosterEntry[] }>(`/attendance${classroomId ? `?classroomId=${classroomId}` : ''}`),
    refetchInterval: 120_000,
  });

  const counts = useMemo(() => {
    const c = { PRESENT: 0, CHECKED_OUT: 0, ABSENT: 0, NOT_ARRIVED: 0 };
    for (const r of roster.data?.roster ?? []) c[r.attendance?.status ?? 'NOT_ARRIVED']++;
    return c;
  }, [roster.data]);

  return (
    <>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.subtitle')} />
      <ClosedBanner closure={roster.data?.closure ?? null} />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        <Chip active={!classroomId} onClick={() => setParams({})} color="#FF7A59">
          🌈 {t('attendance.allClassrooms')}
        </Chip>
        {rooms.data?.classrooms.map((r) => (
          <Chip key={r.id} active={classroomId === r.id} onClick={() => setParams({ classroom: r.id })} color={r.color}>
            {r.emoji} {r.name}
          </Chip>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(counts) as AttendanceStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold ring-1 ring-line">
            <span className="font-display text-lg">{counts[s]}</span>
            <StatusPill status={s} />
          </span>
        ))}
      </div>

      {roster.isLoading ? (
        <Spinner />
      ) : roster.error ? (
        <ErrorBox error={roster.error} onRetry={() => void roster.refetch()} />
      ) : roster.data!.roster.length === 0 ? (
        <EmptyState emoji="🧺" text={t('attendance.empty')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {roster.data!.roster.map((entry) => {
            const status = entry.attendance?.status ?? 'NOT_ARRIVED';
            const name = fullName(entry.child);
            return (
              <button
                key={entry.child.id}
                onClick={() => setSelected(entry)}
                disabled={!!roster.data!.closure && status !== 'PRESENT'}
                className={cx(
                  'relative flex flex-col items-center gap-2 rounded-[1.75rem] p-4 text-center ring-2 transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-[var(--shadow-soft)] disabled:cursor-not-allowed disabled:opacity-50',
                  tileStyles[status],
                )}
              >
                {entry.child.allergies && (
                  <span className="absolute right-3 top-3 text-coral" title={t('attendance.allergy', { list: entry.child.allergies })}>
                    <AlertTriangle size={18} />
                  </span>
                )}
                <Avatar name={name} size={64} color={entry.child.classroom?.color} />
                <span className="font-display text-lg font-bold leading-tight">{entry.child.firstName}</span>
                <span className="-mt-2 text-xs font-bold text-muted">{entry.child.lastName}</span>
                <StatusPill status={status} />
                {entry.child.messages[0] && (
                  <span className="w-full truncate rounded-full bg-sun-soft px-2 py-0.5 text-[11px] font-extrabold text-[#9a6a00]" title={entry.child.messages[0].note ?? undefined}>
                    {messageText(entry.child.messages[0])}
                  </span>
                )}
                <span className="h-4 text-xs font-bold text-ink-soft">
                  {status === 'PRESENT' && `↘ ${formatTime(entry.attendance?.checkInAt)}`}
                  {status === 'CHECKED_OUT' && `↗ ${formatTime(entry.attendance?.checkOutAt)}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && <CheckModal entry={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
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

function CheckModal({ entry, onClose }: { entry: RosterEntry; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const status = entry.attendance?.status ?? 'NOT_ARRIVED';
  const isCheckOut = status === 'PRESENT';
  const people = [
    ...entry.child.guardians.map((g) => ({ name: fullName(g.user), relationship: g.relationship })),
    ...entry.child.pickupPeople.map((p) => ({ name: p.fullName, relationship: p.relationship })),
  ];
  const [person, setPerson] = useState<string>(people[0]?.name ?? '');
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const who = person === '__other' ? other.trim() : person;

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['attendance'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['classrooms'] });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (status === 'CHECKED_OUT') {
        await api.delete(`/attendance/${entry.attendance!.id}`);
        return { authorized: true };
      }
      if (isCheckOut) {
        return api.post<{ authorized: boolean }>('/attendance/check-out', { childId: entry.child.id, pickedUpBy: who, note: note || null });
      }
      await api.post('/attendance/check-in', { childId: entry.child.id, droppedOffBy: who || null, note: note || null });
      return { authorized: true };
    },
    onSuccess: (res) => {
      done();
      if (!res.authorized) setWarning(t('attendance.unauthorized', { name: who }));
      else onClose();
    },
  });

  if (warning) {
    return (
      <Modal open onClose={onClose} title={entry.child.firstName}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-coral-soft text-coral">
            <AlertTriangle size={32} />
          </span>
          <p className="text-lg font-extrabold">{warning}</p>
          <Button onClick={onClose}>OK</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={fullName(entry.child)}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={fullName(entry.child)} size={56} color={entry.child.classroom?.color} />
        <div>
          <StatusPill status={status} />
          {entry.child.allergies && (
            <p className="mt-1 flex items-center gap-1 text-sm font-bold text-coral">
              <AlertTriangle size={14} /> {t('attendance.allergy', { list: entry.child.allergies })}
            </p>
          )}
        </div>
      </div>

      {status === 'CHECKED_OUT' ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-sky-soft px-4 py-3 font-bold">
            ↗ {formatTime(entry.attendance?.checkOutAt)} · {entry.attendance?.pickedUpBy}
          </p>
          <FormError error={mutation.error} />
          <Button variant="secondary" className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Undo2 size={18} /> {t('attendance.undo')}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div>
            <p className="label">{isCheckOut ? t('attendance.pickedUpBy') : t('attendance.droppedOffBy')}</p>
            <div className="grid gap-2">
              {people.map((p) => (
                <label
                  key={p.name}
                  className={cx(
                    'flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-2 transition',
                    person === p.name ? 'ring-coral' : 'ring-line',
                  )}
                >
                  <input type="radio" className="sr-only" checked={person === p.name} onChange={() => setPerson(p.name)} />
                  <Avatar name={p.name} size={34} />
                  <span className="flex-1 font-extrabold">{p.name}</span>
                  <span className="text-xs font-bold text-muted">{p.relationship}</span>
                </label>
              ))}
              <label
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-2',
                  person === '__other' ? 'ring-coral' : 'ring-line',
                )}
              >
                <input type="radio" className="sr-only" checked={person === '__other'} onChange={() => setPerson('__other')} />
                <span className="flex size-[34px] items-center justify-center rounded-full bg-cream-deep">✍️</span>
                <span className="font-extrabold">{t('attendance.otherPerson')}</span>
              </label>
              {person === '__other' && (
                <input
                  className="input"
                  placeholder={t('attendance.otherPersonName')}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  required={isCheckOut}
                  autoFocus
                />
              )}
            </div>
          </div>
          <Field label={`${t('attendance.note')} (${t('common.optional')})`}>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <FormError error={mutation.error} />
          <Button type="submit" size="lg" variant={isCheckOut ? 'primary' : 'mint'} className="w-full" disabled={mutation.isPending || (isCheckOut && !who)}>
            {isCheckOut ? <LogOut size={20} /> : <LogIn size={20} />}
            {isCheckOut ? t('attendance.checkOut') : t('attendance.checkIn')}
          </Button>
          {status === 'PRESENT' && (
            <button
              type="button"
              className="mx-auto flex items-center gap-1 text-sm font-bold text-muted hover:text-ink"
              onClick={() => api.delete(`/attendance/${entry.attendance!.id}`).then(() => (done(), onClose()))}
            >
              <Undo2 size={14} /> {t('attendance.undo')}
            </button>
          )}
        </form>
      )}
    </Modal>
  );
}
