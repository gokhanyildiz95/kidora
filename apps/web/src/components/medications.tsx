import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, formatTime, fullName, todayIso } from '../lib/format';
import type { MedicationDose, MedicationPlan } from '../lib/types';
import { Button, EmptyState, Field, FormError, Modal, cx } from './ui';

export function useMedicationsToday(enabled = true) {
  return useQuery({
    queryKey: ['medications', 'today'],
    queryFn: () => api.get<{ date: string; doses: MedicationDose[]; attention: number }>('/medications/today'),
    refetchInterval: 60_000,
    enabled,
  });
}

const statusStyle: Record<MedicationDose['status'], string> = {
  GIVEN: 'bg-mint-soft text-[#1f7a5c]',
  LATE: 'bg-rose-soft text-[#b83a62]',
  DUE: 'bg-sun-soft text-[#9a6a00]',
  UPCOMING: 'bg-cream-deep text-ink-soft',
};

function useGive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: MedicationDose) => api.post(`/medications/${d.planId}/give`, { slot: d.slot }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['medications'] });
      void qc.invalidateQueries({ queryKey: ['activities'] });
      void qc.invalidateQueries({ queryKey: ['report'] });
    },
  });
}

export function DoseList({ doses, compact = false }: { doses: MedicationDose[]; compact?: boolean }) {
  const { t } = useTranslation();
  const user = useUser();
  const give = useGive();
  return (
    <ul className="space-y-2">
      {doses.map((d) => (
        <li
          key={`${d.planId}-${d.slot}`}
          className={cx('rounded-2xl bg-cream px-3 py-2.5', (d.status === 'DUE' || d.status === 'LATE') && 'ring-2 ring-sun')}
        >
          <div className="flex items-start gap-3">
            <span className="w-12 shrink-0 font-display text-lg font-extrabold">{d.slot}</span>
            <div className="min-w-0 flex-1">
              {!compact && (
                <Link to={`/children/${d.child.id}`} className="block truncate text-sm font-extrabold text-ink-soft hover:text-coral">
                  {fullName(d.child)}
                </Link>
              )}
              <p className="font-extrabold leading-snug">
                💊 {d.name} <span className="font-bold text-ink-soft">· {d.dose}</span>
              </p>
              {d.status === 'GIVEN' && d.givenAt ? (
                <p className="text-xs font-bold text-ink-soft">{t('meds.givenAt', { time: formatTime(d.givenAt), name: d.givenBy ? fullName(d.givenBy) : '' })}</p>
              ) : (
                d.instructions && <p className="text-xs font-bold text-ink-soft">{d.instructions}</p>
              )}
            </div>
            <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold', statusStyle[d.status])}>{t(`meds.status.${d.status}`)}</span>
          </div>
          {d.status !== 'GIVEN' && user.role !== 'PARENT' && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="mint" onClick={() => give.mutate(d)} disabled={give.isPending}>
                ✓ {t('meds.give')}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Dashboard card for staff. */
export function MedicationReminders() {
  const { t } = useTranslation();
  const query = useMedicationsToday();
  const doses = query.data?.doses ?? [];
  return (
    <section className="card">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold">💊 {t('meds.reminders')}</h2>
      {doses.length === 0 ? <p className="text-sm text-ink-soft">{t('meds.noneToday')}</p> : <DoseList doses={doses} />}
    </section>
  );
}

/** Sticky reminder at the top of every staff page while a dose is due or late. */
export function MedicationBanner() {
  const { t } = useTranslation();
  const query = useMedicationsToday();
  const [open, setOpen] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const attention = query.data?.attention ?? 0;
  if (!attention || (dismissedAt !== null && dismissedAt >= attention)) return null;
  const pending = (query.data?.doses ?? []).filter((d) => d.status === 'DUE' || d.status === 'LATE');
  return (
    <>
      <div className="mb-5 flex items-center gap-3 rounded-[1.75rem] bg-sun px-4 py-3 shadow-[var(--shadow-soft)]">
        <p className="flex-1 font-extrabold">{t('meds.banner', { count: attention })}</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {t('meds.bannerOpen')}
        </Button>
        <button className="rounded-full p-1.5 hover:bg-white/50" onClick={() => setDismissedAt(attention)} aria-label="Kapat">
          <X size={18} />
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t('meds.reminders')}>
        <DoseList doses={pending} />
      </Modal>
    </>
  );
}

/** Medication tab on the child profile: plans plus today's doses. */
export function MedicationPlans({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const plans = useQuery({
    queryKey: ['medications', 'child', childId],
    queryFn: () => api.get<{ plans: MedicationPlan[] }>(`/medications/child/${childId}`),
  });
  const today = useMedicationsToday();
  const todays = (today.data?.doses ?? []).filter((d) => d.child.id === childId);
  const remove = (id: string) =>
    void api.delete(`/medications/${id}`).then(() => qc.invalidateQueries({ queryKey: ['medications'] }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">💊 {t('meds.title')}</h2>
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t('meds.add')}
          </Button>
        </div>
        <p className="mb-3 text-sm text-ink-soft">{t('meds.hint')}</p>
        {plans.data?.plans.length === 0 && <EmptyState emoji="💊" text={t('meds.empty')} />}
        <ul className="space-y-2">
          {plans.data?.plans.map((p) => {
            const active = p.endDate >= todayIso();
            return (
              <li key={p.id} className={cx('rounded-2xl bg-cream px-4 py-3', !active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold">
                      {p.name} · {p.dose}
                    </p>
                    <p className="text-sm font-bold text-ink-soft">
                      🕐 {p.times.join(', ')} · {formatDate(p.startDate, { day: 'numeric', month: 'short' })} – {formatDate(p.endDate, { day: 'numeric', month: 'short' })}
                    </p>
                    {p.instructions && <p className="text-sm text-ink-soft">{p.instructions}</p>}
                    <p className="mt-1 text-xs font-bold text-muted">
                      {active ? t('meds.active') : t('meds.ended')} · {t(`meds.addedBy.${p.createdRole}`)}
                    </p>
                  </div>
                  <button onClick={() => remove(p.id)} className="rounded-full p-2 text-muted hover:bg-rose-soft hover:text-[#b83a62]" aria-label={t('common.delete')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2 className="mb-3 text-xl font-extrabold">📅 {t('meds.reminders')}</h2>
        {todays.length === 0 ? <p className="text-sm text-ink-soft">{t('meds.noneToday')}</p> : <DoseList doses={todays} compact />}
      </section>
      {adding && <AddPlanModal childId={childId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddPlanModal({ childId, onClose }: { childId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', dose: '', startDate: todayIso(), endDate: todayIso(), instructions: '' });
  const [times, setTimes] = useState<string[]>(['09:00']);
  const save = useMutation({
    mutationFn: () => api.post('/medications', { ...form, childId, times: times.filter(Boolean), instructions: form.instructions || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['medications'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={t('meds.add')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('meds.name')}>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t('meds.dose')}>
            <input className="input" required placeholder={t('meds.dosePlaceholder')} value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
          </Field>
        </div>
        <div>
          <p className="label">{t('meds.times')}</p>
          <div className="flex flex-wrap items-center gap-2">
            {times.map((tm, i) => (
              <span key={i} className="flex items-center gap-1">
                <input
                  className="input w-32"
                  type="time"
                  required
                  value={tm}
                  onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {times.length > 1 && (
                  <button type="button" className="rounded-full p-1.5 text-muted hover:bg-cream-deep" onClick={() => setTimes(times.filter((_, j) => j !== i))} aria-label={t('common.delete')}>
                    <X size={16} />
                  </button>
                )}
              </span>
            ))}
            {times.length < 6 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setTimes([...times, '13:00'])}>
                <Plus size={14} /> {t('meds.addTime')}
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('meds.start')}>
            <input className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label={t('meds.end')}>
            <input className="input" type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
        </div>
        <Field label={t('meds.instructions')}>
          <input className="input" placeholder={t('meds.instructionsPlaceholder')} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </Field>
        <FormError error={save.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
