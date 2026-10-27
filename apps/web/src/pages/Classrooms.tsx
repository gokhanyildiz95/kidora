import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import type { ClassroomInput } from '@kidora/shared';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fullName } from '../lib/format';
import type { Classroom } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, ErrorBox, Field, FormError, Modal, PageHeader, Spinner, cx } from '../components/ui';

const COLORS = ['#FF7A59', '#FFB547', '#7BC67E', '#4CBF98', '#5AB4F0', '#9B8CFF', '#FF8FB1'];
const EMOJIS = ['🐣', '🐛', '🦋', '🐝', '🐞', '🐢', '🦊', '🐻', '🐰', '🦁', '🐳', '🌻'];

export function ClassroomsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [editing, setEditing] = useState<Classroom | 'new' | null>(null);
  const query = useQuery({ queryKey: ['classrooms'], queryFn: () => api.get<{ classrooms: Classroom[] }>('/classrooms') });

  return (
    <>
      <PageHeader
        title={t('classrooms.title')}
        action={
          user.role === 'ADMIN' && (
            <Button onClick={() => setEditing('new')}>
              <Plus size={18} /> {t('classrooms.add')}
            </Button>
          )
        }
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : query.data!.classrooms.length === 0 ? (
        <EmptyState emoji="🏡" text={t('classrooms.empty')} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {query.data!.classrooms.map((room) => (
            <article key={room.id} className="card relative overflow-hidden">
              <div className="absolute -right-8 -top-8 size-32 rounded-full opacity-20" style={{ background: room.color }} />
              <div className="relative flex items-start gap-3">
                <span className="flex size-16 items-center justify-center rounded-3xl text-4xl" style={{ background: `${room.color}2a` }}>
                  {room.emoji}
                </span>
                <div className="flex-1">
                  <h2 className="text-2xl font-extrabold">{room.name}</h2>
                  {room.ageGroup && <p className="font-bold text-ink-soft">{room.ageGroup}</p>}
                </div>
                {user.role === 'ADMIN' && (
                  <button onClick={() => setEditing(room)} className="rounded-full p-2 text-muted hover:bg-cream-deep" aria-label={t('common.edit')}>
                    <Pencil size={16} />
                  </button>
                )}
              </div>
              <div className="relative mt-4 flex flex-wrap gap-2">
                <Badge color={room.color}>{t('classrooms.childrenCount', { count: room.childCount })}</Badge>
                <Badge color="#4CBF98">{t('classrooms.presentNow', { count: room.presentCount })}</Badge>
                <Badge color="#8A8292">
                  {t('classrooms.capacity')}: {room.capacity} · 1:{room.ratio}
                </Badge>
              </div>
              <div className="relative mt-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">{t('classrooms.teachers')}</p>
                {room.staff.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t('classrooms.noTeachers')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {room.staff.map((s) => (
                      <span key={s.id} className="flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm font-bold">
                        <Avatar name={fullName(s)} size={26} />
                        {fullName(s)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Link to={`/attendance?classroom=${room.id}`} className="relative mt-5 block">
                <Button variant="secondary" size="sm" className="w-full">
                  {t('nav.attendance')} →
                </Button>
              </Link>
            </article>
          ))}
        </div>
      )}
      {editing && <ClassroomModal room={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ClassroomModal({ room, onClose }: { room?: Classroom; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<ClassroomInput>({
    name: room?.name ?? '',
    ageGroup: room?.ageGroup ?? '',
    color: room?.color ?? COLORS[0]!,
    emoji: room?.emoji ?? EMOJIS[0]!,
    capacity: room?.capacity ?? 16,
    ratio: room?.ratio ?? 8,
  });
  const mutation = useMutation({
    mutationFn: () => (room ? api.patch(`/classrooms/${room.id}`, form) : api.post('/classrooms', form)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['classrooms'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={room ? room.name : t('classrooms.add')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label={t('classrooms.name')}>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label={t('classrooms.ageGroup')}>
          <input className="input" placeholder="3-4 yaş" value={form.ageGroup ?? ''} onChange={(e) => setForm({ ...form, ageGroup: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('classrooms.capacity')}>
            <input className="input" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </Field>
          <Field label={t('classrooms.ratio')}>
            <input className="input" type="number" min={1} value={form.ratio} onChange={(e) => setForm({ ...form, ratio: Number(e.target.value) })} />
          </Field>
        </div>
        <div>
          <p className="label">{t('classrooms.emoji')}</p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setForm({ ...form, emoji: e })}
                className={cx('size-11 rounded-2xl bg-white text-2xl ring-2', form.emoji === e ? 'ring-coral' : 'ring-line')}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">{t('classrooms.color')}</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                className={cx('size-10 rounded-full ring-4', form.color === c ? 'ring-ink/30' : 'ring-transparent')}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
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
