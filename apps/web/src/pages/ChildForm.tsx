import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChildInput } from '@kidora/shared';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import type { Child, Classroom } from '../lib/types';
import { Button, Field, FormError, Modal } from '../components/ui';

/** Create (no `child`) or edit a child's profile. Admins and teachers; teachers only within their own classrooms. */
export function ChildFormModal({ child, onClose }: { child?: Child; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useUser();
  const isTeacher = user.role === 'TEACHER';
  const rooms = useQuery({ queryKey: ['classrooms'], queryFn: () => api.get<{ classrooms: Classroom[] }>('/classrooms') });
  const [form, setForm] = useState<ChildInput>({
    firstName: child?.firstName ?? '',
    lastName: child?.lastName ?? '',
    birthDate: child?.birthDate.slice(0, 10) ?? '',
    gender: child?.gender ?? null,
    classroomId: child?.classroomId ?? null,
    allergies: child?.allergies ?? '',
    medicalNotes: child?.medicalNotes ?? '',
    dietaryNotes: child?.dietaryNotes ?? '',
    notes: child?.notes ?? '',
    photoConsent: child?.photoConsent ?? true,
    status: child?.status ?? 'ACTIVE',
  });
  const set = <K extends keyof ChildInput>(key: K, value: ChildInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: () => {
      const body = { ...form, allergies: form.allergies || null, medicalNotes: form.medicalNotes || null, dietaryNotes: form.dietaryNotes || null, notes: form.notes || null };
      return child ? api.patch(`/children/${child.id}`, body) : api.post('/children', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['children'] });
      void qc.invalidateQueries({ queryKey: ['child'] });
      void qc.invalidateQueries({ queryKey: ['classrooms'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={child ? t('common.edit') : t('children.add')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('children.firstName')}>
            <input className="input" required value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label={t('children.lastName')}>
            <input className="input" required value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          <Field label={t('children.birthDate')}>
            <input className="input" type="date" required value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
          </Field>
          <Field label={t('children.gender')}>
            <select className="input" value={form.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as ChildInput['gender'])}>
              <option value="">—</option>
              {(['FEMALE', 'MALE', 'OTHER'] as const).map((g) => (
                <option key={g} value={g}>
                  {t(`children.genders.${g}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('children.classroom')}>
          <select className="input" required={isTeacher} value={form.classroomId ?? ''} onChange={(e) => set('classroomId', e.target.value || null)}>
            <option value="">{isTeacher ? '—' : t('children.noClassroom')}</option>
            {rooms.data?.classrooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.emoji} {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('children.allergies')}>
          <input className="input" value={form.allergies ?? ''} onChange={(e) => set('allergies', e.target.value)} />
        </Field>
        <Field label={t('children.medicalNotes')}>
          <textarea className="input min-h-20" value={form.medicalNotes ?? ''} onChange={(e) => set('medicalNotes', e.target.value)} />
        </Field>
        <Field label={t('children.dietaryNotes')}>
          <input className="input" value={form.dietaryNotes ?? ''} onChange={(e) => set('dietaryNotes', e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="size-5 accent-coral" checked={form.photoConsent} onChange={(e) => set('photoConsent', e.target.checked)} />
          {t('children.photoConsent')}
        </label>
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
