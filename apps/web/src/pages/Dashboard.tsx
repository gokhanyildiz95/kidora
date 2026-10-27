import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Cake, CalendarX, LogIn, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatAge, formatDate, formatTime, fullName, greetingKey, todayIso } from '../lib/format';
import type { ParentDashboard, StaffDashboard } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, ErrorBox, Field, FormError, Modal, Spinner, StatusPill, cx } from '../components/ui';
import { Mascot } from '../components/Mascot';
import { ClosedBanner } from '../components/ClosedBanner';
import { ActivityIcon, useDescribe } from '../components/activity';
import { useDailyReport } from './DailyReport';
import { useMessageText } from './Messages';
import { MedicationReminders } from '../components/medications';

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<StaffDashboard | ParentDashboard>('/dashboard'),
    refetchInterval: 120_000,
  });
  if (query.isLoading) return <Spinner />;
  if (query.error) return <ErrorBox error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data!;
  return data.kind === 'parent' ? <ParentHome data={data} /> : <StaffHome data={data} />;
}

function Greeting({ subtitle }: { subtitle: string }) {
  const { t } = useTranslation();
  const user = useUser();
  return (
    <div className="relative mb-8 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sun to-[#ffb547] px-6 py-7 md:px-10">
      <div className="pointer-events-none absolute -right-6 -top-6 opacity-90 md:right-6">
        <Mascot size={150} />
      </div>
      <p className="font-bold text-ink/70">{formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1 className="mt-1 max-w-[70%] text-3xl font-extrabold md:text-4xl">
        {t(greetingKey())}, {user.firstName}! 👋
      </h1>
      <p className="mt-1 max-w-[65%] font-semibold text-ink/75">{subtitle}</p>
    </div>
  );
}

function StatCard({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  return (
    <div className="card flex items-center gap-4">
      <span className="flex size-14 items-center justify-center rounded-2xl text-2xl" style={{ background: `${color}22` }}>
        {emoji}
      </span>
      <div>
        <p className="font-display text-3xl font-extrabold leading-none">{value}</p>
        <p className="mt-1 text-sm font-bold text-ink-soft">{label}</p>
      </div>
    </div>
  );
}

function StaffHome({ data }: { data: StaffDashboard }) {
  const { t } = useTranslation();
  const messageText = useMessageText();
  const { counts } = data;
  return (
    <>
      <ClosedBanner closure={data.closure} />
      <Greeting subtitle={t('attendance.summary', { present: counts.PRESENT, out: counts.CHECKED_OUT, absent: counts.ABSENT, waiting: counts.NOT_ARRIVED })} />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('status.PRESENT')} value={counts.PRESENT} color="#4CBF98" emoji="🏫" />
        <StatCard label={t('status.NOT_ARRIVED')} value={counts.NOT_ARRIVED} color="#FFC94D" emoji="⏳" />
        <StatCard label={t('status.CHECKED_OUT')} value={counts.CHECKED_OUT} color="#5AB4F0" emoji="🏠" />
        <StatCard label={t('status.ABSENT')} value={counts.ABSENT} color="#FF8FB1" emoji="🤒" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl font-extrabold">{t('dashboard.classrooms')}</h2>
            <Link to="/attendance" className="flex items-center gap-1 text-sm font-extrabold text-coral">
              {t('dashboard.goAttendance')} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.classrooms.map((room) => {
              const pct = room.enrolled ? Math.round((room.present / room.enrolled) * 100) : 0;
              return (
                <Link
                  key={room.id}
                  to={`/attendance?classroom=${room.id}`}
                  className="card group transition hover:-translate-y-0.5"
                  style={{ borderTop: `6px solid ${room.color}` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 items-center justify-center rounded-2xl text-2xl" style={{ background: `${room.color}26` }}>
                      {room.emoji}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-xl font-extrabold">{room.name}</h3>
                      <p className="text-sm font-bold text-ink-soft">{t('dashboard.present', { present: room.present, enrolled: room.enrolled })}</p>
                    </div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-cream-deep">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: room.color }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-bold text-muted">
                      {t('dashboard.ratio')} 1:{room.ratio}
                    </span>
                    {room.ratioOk ? (
                      <Badge color="#4CBF98">✓ {t('dashboard.ratioOk')}</Badge>
                    ) : (
                      <Badge color="#FF7A59">
                        <AlertTriangle size={12} /> {t('dashboard.ratioWarn', { needed: room.staffNeeded })}
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <h2 className="mb-3 mt-8 text-2xl font-extrabold">{t('dashboard.recent')}</h2>
          {data.recent.length === 0 ? (
            <EmptyState emoji="🌤️" text={t('dashboard.noRecent')} />
          ) : (
            <ul className="card divide-y divide-line p-2">
              {data.recent.map((r) => {
                const out = r.status === 'CHECKED_OUT';
                return (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-3">
                    <Avatar name={fullName(r.child)} size={38} />
                    <Link to={`/children/${r.child.id}`} className="flex-1 font-extrabold hover:text-coral">
                      {fullName(r.child)}
                    </Link>
                    <span className={cx('flex items-center gap-1.5 text-sm font-bold', out ? 'text-sky' : 'text-mint')}>
                      {out ? <LogOut size={15} /> : <LogIn size={15} />}
                      {out ? t('dashboard.checkedOutAt', { time: formatTime(r.checkOutAt) }) : t('dashboard.checkedInAt', { time: formatTime(r.checkInAt) })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card bg-sun-soft/60">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-extrabold">📣 {t('family.notices')}</h2>
              <Link to="/messages" className="text-sm font-extrabold text-coral">
                <ArrowRight size={16} />
              </Link>
            </div>
            {data.familyNotices.length === 0 ? (
              <p className="text-sm text-ink-soft">{t('family.noNotices')}</p>
            ) : (
              <ul className="space-y-2">
                {data.familyNotices.map((n) => (
                  <li key={n.id}>
                    <Link to={`/messages/${n.child.id}`} className="block rounded-2xl bg-white px-3 py-2 transition hover:-translate-y-0.5">
                      <p className="flex items-center justify-between gap-2 font-extrabold">
                        <span className="truncate">
                          {n.child.classroom?.emoji} {fullName(n.child)}
                        </span>
                        <span className="shrink-0 text-xs font-bold text-muted">{formatTime(n.createdAt)}</span>
                      </p>
                      <p className="text-sm font-bold text-ink-soft">{messageText(n)}</p>
                      {n.note && <p className="text-xs text-muted">“{n.note}”</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <MedicationReminders />

          <section className="card bg-rose-soft/50">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold">
              <AlertTriangle size={20} className="text-coral" /> {t('dashboard.allergies')}
            </h2>
            {data.allergiesPresent.length === 0 ? (
              <p className="text-sm text-ink-soft">{t('dashboard.noAllergies')}</p>
            ) : (
              <ul className="space-y-2">
                {data.allergiesPresent.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
                    <span className="font-extrabold">{fullName(c)}</span>
                    <Badge color="#FF7A59">{c.allergies}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold">
              <Cake size={20} className="text-lilac" /> {t('dashboard.birthdays')}
            </h2>
            {data.birthdays.length === 0 ? (
              <p className="text-sm text-ink-soft">{t('dashboard.noBirthdays')}</p>
            ) : (
              <ul className="space-y-2">
                {data.birthdays.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-lilac-soft px-3 py-2">
                    <span className="text-2xl">🎂</span>
                    <div className="flex-1">
                      <p className="font-extrabold">{fullName(b)}</p>
                      <p className="text-xs font-bold text-ink-soft">
                        {formatDate(b.date)} · {t('dashboard.turning', { count: b.turning })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function ParentHome({ data }: { data: ParentDashboard }) {
  const { t } = useTranslation();
  const [absenceFor, setAbsenceFor] = useState<ParentDashboard['children'][number] | null>(null);

  return (
    <>
      <ClosedBanner closure={data.closure} />
      <Greeting subtitle={t('parent.subtitle')} />
      <div className="grid gap-6 md:grid-cols-2">
        {data.children.map((child) => {
          const a = child.today;
          const status = a?.status ?? 'NOT_ARRIVED';
          const color = child.classroom?.color ?? '#FF7A59';
          return (
            <article key={child.id} className="card overflow-hidden p-0">
              <div className="flex items-center gap-4 p-5" style={{ background: `${color}1f` }}>
                <Avatar name={fullName(child)} size={72} color={color} />
                <div className="flex-1">
                  <h2 className="text-2xl font-extrabold">{child.firstName}</h2>
                  <p className="text-sm font-bold text-ink-soft">
                    {child.classroom ? `${child.classroom.emoji} ${child.classroom.name}` : ''} · {formatAge(child.birthDate)}
                  </p>
                </div>
                <StatusPill status={status} />
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3 font-bold">
                  <span className="text-2xl">{{ PRESENT: '🏫', CHECKED_OUT: '🏠', ABSENT: '🛌', NOT_ARRIVED: '🌅' }[status]}</span>
                  <span>
                    {status === 'PRESENT' && t('parent.arrivedAt', { time: formatTime(a?.checkInAt) })}
                    {status === 'CHECKED_OUT' && t('parent.leftAt', { time: formatTime(a?.checkOutAt), who: a?.pickedUpBy })}
                    {status === 'ABSENT' && t('parent.absent')}
                    {status === 'NOT_ARRIVED' && t('parent.notArrived')}
                  </span>
                </div>
                {child.classroom && child.classroom.staff.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">{t('parent.teachers')}</p>
                    <div className="flex flex-wrap gap-2">
                      {child.classroom.staff.map((s) => (
                        <span key={fullName(s)} className="flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm font-bold">
                          <Avatar name={fullName(s)} size={28} />
                          {fullName(s)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <TodayFeed childId={child.id} />
                <div className="flex flex-wrap gap-2">
                  <Link to={`/children/${child.id}/report`}>
                    <Button size="sm">📒 {t('parent.seeReport')}</Button>
                  </Link>
                  <Link to={`/messages/${child.id}`}>
                    <Button size="sm" variant="secondary">
                      💬 {t('messages.title')}
                    </Button>
                  </Link>
                  <Link to={`/children/${child.id}`}>
                    <Button variant="secondary" size="sm">
                      {t('parent.viewProfile')}
                    </Button>
                  </Link>
                  {status === 'NOT_ARRIVED' && !data.closure && (
                    <Button variant="danger" size="sm" onClick={() => setAbsenceFor(child)}>
                      <CalendarX size={16} /> {t('parent.reportAbsence')}
                    </Button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {absenceFor && <AbsenceModal child={absenceFor} onClose={() => setAbsenceFor(null)} />}
    </>
  );
}

function AbsenceModal({ child, onClose }: { child: { id: string; firstName: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post('/attendance/absence', { childId: child.id, date, reason: reason || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={t('parent.absenceTitle', { name: child.firstName })}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label={t('parent.absenceDate')}>
          <input className="input" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={t('parent.absenceReason')}>
          <textarea
            className="input min-h-24"
            placeholder={t('parent.absenceReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <FormError error={mutation.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TodayFeed({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const describe = useDescribe();
  const report = useDailyReport(childId, todayIso());
  const latest = [...(report.data?.activities ?? [])].reverse().slice(0, 3);
  const pendingIncidents = report.data?.summary.unacknowledgedIncidents ?? 0;
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">{t('parent.todayFeed')}</p>
      {pendingIncidents > 0 && (
        <Link to={`/children/${childId}/report`} className="mb-2 flex items-center gap-2 rounded-2xl bg-rose-soft px-3 py-2 text-sm font-extrabold text-[#b83a62]">
          🩹 {t('daily.types.INCIDENT')} · {t('daily.needsAck')}
        </Link>
      )}
      {latest.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line px-4 py-3 text-sm font-semibold text-ink-soft">{t('daily.feedEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {latest.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
              <ActivityIcon type={a.type} size={36} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{describe(a)}</span>
              <span className="text-xs font-extrabold text-muted">{formatTime(a.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs font-semibold text-muted">{t('parent.comingSoon')}</p>
    </div>
  );
}
