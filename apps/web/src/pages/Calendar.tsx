import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { PUBLIC_HOLIDAY_YEARS, turkishPublicHolidays } from '@kidora/shared';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, todayIso } from '../lib/format';
import type { CalendarData, Holiday } from '../lib/types';
import { Button, EmptyState, ErrorBox, Field, FormError, PageHeader, Spinner, cx } from '../components/ui';
import { ClosedBanner } from '../components/ClosedBanner';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5) + 1;
}

export function CalendarPage() {
  const { t } = useTranslation();
  const user = useUser();
  const isAdmin = user.role === 'ADMIN';
  const query = useQuery({ queryKey: ['calendar'], queryFn: () => api.get<CalendarData>('/calendar') });

  if (query.isLoading) return <Spinner />;
  if (query.error) return <ErrorBox error={query.error} />;
  const data = query.data!;

  return (
    <>
      <PageHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')} />
      <ClosedBanner closure={data.today.closure} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <MonthView data={data} />
          <HolidayList holidays={data.holidays} canDelete={isAdmin} />
        </div>
        {isAdmin && (
          <div className="space-y-6 lg:col-span-2">
            <AddHoliday />
            <Settings weekendsClosed={data.weekendsClosed} />
            <Presets />
          </div>
        )}
      </div>
    </>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['attendance'] });
  };
}

function MonthView({ data }: { data: CalendarData }) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const today = todayIso();
  const weekdays = t('calendar.weekdays').split(',');

  const cells = useMemo(() => {
    const first = new Date(cursor);
    // Monday-first grid
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const holidayOn = (day: string) => data.holidays.find((h) => h.startDate <= day && h.endDate >= day);

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold capitalize">{formatDate(iso(cursor), { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="‹">
            <ChevronLeft size={18} />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="›">
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {weekdays.map((w) => (
          <span key={w} className="pb-1 text-xs font-extrabold uppercase text-muted">
            {w}
          </span>
        ))}
        {cells.map((d) => {
          const day = iso(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const holiday = holidayOn(day);
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          const closedWeekend = weekend && data.weekendsClosed;
          return (
            <div
              key={day}
              title={holiday?.name}
              className={cx(
                'flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-extrabold',
                !inMonth && 'opacity-30',
                holiday ? 'bg-sky text-white' : closedWeekend ? 'bg-cream-deep text-muted' : 'bg-cream',
                day === today && 'ring-3 ring-coral',
              )}
            >
              {d.getDate()}
              {holiday && <span className="text-[10px] leading-none">🏖️</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HolidayList({ holidays, canDelete }: { holidays: Holiday[]; canDelete: boolean }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const upcoming = holidays.filter((h) => h.endDate >= todayIso());
  return (
    <section className="card">
      <h2 className="mb-3 text-xl font-extrabold">{t('calendar.upcoming')}</h2>
      {upcoming.length === 0 ? (
        <EmptyState emoji="🗓️" text={t('calendar.noHolidays')} />
      ) : (
        <ul className="space-y-2">
          {upcoming.map((h) => {
            const n = daysBetween(h.startDate, h.endDate);
            return (
              <li key={h.id} className="flex items-center gap-3 rounded-2xl bg-cream px-4 py-3">
                <span className="text-2xl">🏖️</span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{h.name}</p>
                  <p className="text-sm font-bold text-ink-soft">
                    {formatDate(h.startDate, { day: 'numeric', month: 'long', year: 'numeric' })}
                    {n > 1 && ` – ${formatDate(h.endDate, { day: 'numeric', month: 'long' })} · ${t('calendar.days', { count: n })}`}
                  </p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => void api.delete(`/calendar/holidays/${h.id}`).then(refresh)}
                    className="rounded-full p-2 text-muted hover:bg-rose-soft hover:text-[#b83a62]"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddHoliday() {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const [form, setForm] = useState({ name: '', startDate: todayIso(), endDate: todayIso() });
  const mutation = useMutation({
    mutationFn: () => api.post('/calendar/holidays', form),
    onSuccess: () => {
      refresh();
      setForm({ name: '', startDate: todayIso(), endDate: todayIso() });
    },
  });
  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="text-xl font-extrabold">{t('calendar.add')}</h2>
      <Field label={t('calendar.name')}>
        <input className="input" required placeholder={t('calendar.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('calendar.start')}>
          <input
            className="input"
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })}
          />
        </Field>
        <Field label={t('calendar.end')}>
          <input className="input" type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
      </div>
      <FormError error={mutation.error} />
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {t('calendar.add')}
      </Button>
    </form>
  );
}

function Settings({ weekendsClosed }: { weekendsClosed: boolean }) {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const mutation = useMutation({
    mutationFn: (value: boolean) => api.patch('/calendar/settings', { weekendsClosed: value }),
    onSuccess: refresh,
  });
  return (
    <section className="card">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-lg font-extrabold">{t('calendar.weekends')}</span>
          <span className="text-sm text-ink-soft">{t('calendar.weekendsHint')}</span>
        </span>
        <input
          type="checkbox"
          className="size-6 shrink-0 accent-coral"
          checked={weekendsClosed}
          disabled={mutation.isPending}
          onChange={(e) => mutation.mutate(e.target.checked)}
        />
      </label>
    </section>
  );
}

function Presets() {
  const { t } = useTranslation();
  const refresh = useRefresh();
  const years = PUBLIC_HOLIDAY_YEARS.filter((y) => y >= new Date().getFullYear());
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const mutation = useMutation({
    mutationFn: () => api.post<{ added: number }>('/calendar/holidays/batch', { holidays: turkishPublicHolidays(year) }),
    onSuccess: refresh,
  });
  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-extrabold">🇹🇷 {t('calendar.presets')}</h2>
      <p className="text-sm text-ink-soft">{t('calendar.presetsHint')}</p>
      <div className="flex gap-2">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={cx('rounded-full px-4 py-1.5 text-sm font-extrabold ring-2', year === y ? 'bg-ink text-white ring-ink' : 'bg-white ring-line')}
          >
            {y}
          </button>
        ))}
      </div>
      <FormError error={mutation.error} />
      {mutation.data && <p className="text-sm font-bold text-mint">✓ {t('calendar.presetsAdded', { count: mutation.data.added })}</p>}
      <Button variant="secondary" className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {t('calendar.addPresets', { year })}
      </Button>
    </section>
  );
}
