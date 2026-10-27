import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ROLES, type Role } from '@kidora/shared';
import { api } from '../lib/api';
import { formatDate, fullName } from '../lib/format';
import type { Classroom, User } from '../lib/types';
import { Avatar, Badge, Button, ErrorBox, Field, FormError, Modal, PageHeader, Spinner, Tabs } from '../components/ui';

const roleColors: Record<Role, string> = { ADMIN: '#FF7A59', TEACHER: '#4CBF98', PARENT: '#5AB4F0' };

export function PeoplePage() {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role | 'ALL'>('ALL');
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ['users', role],
    queryFn: () => api.get<{ users: User[] }>(`/users${role === 'ALL' ? '' : `?role=${role}`}`),
  });

  return (
    <>
      <PageHeader
        title={t('people.title')}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} /> {t('people.add')}
          </Button>
        }
      />
      <Tabs<Role | 'ALL'>
        value={role}
        onChange={setRole}
        tabs={[{ id: 'ALL', label: t('people.filterAll') }, ...ROLES.map((r) => ({ id: r, label: t(`roles.${r}`) }))]}
      />
      {query.isLoading ? (
        <Spinner />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : (
        <div className="card overflow-hidden p-0">
          <ul className="divide-y divide-line">
            {query.data!.users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Avatar name={fullName(u)} size={44} />
                <div className="min-w-48 flex-1">
                  <p className="font-extrabold">
                    {fullName(u)} {!u.isActive && <Badge color="#8A8292">{t('people.inactive')}</Badge>}
                  </p>
                  <p className="text-sm text-ink-soft">{u.email}</p>
                </div>
                <Badge color={roleColors[u.role]}>{t(`roles.${u.role}`)}</Badge>
                <div className="flex min-w-40 flex-wrap gap-1.5">
                  {u.classrooms.map(({ classroom }) => (
                    <Badge key={classroom.id} color={classroom.color}>
                      {classroom.emoji} {classroom.name}
                    </Badge>
                  ))}
                  {u.children.map(({ child, relationship }) => (
                    <Link key={child.id} to={`/children/${child.id}`}>
                      <Badge color="#9B8CFF">
                        {child.firstName} · {relationship}
                      </Badge>
                    </Link>
                  ))}
                </div>
                <span className="w-36 text-right text-xs font-bold text-muted">
                  {u.lastLoginAt ? `${t('people.lastLogin')}: ${formatDate(u.lastLoginAt, { day: 'numeric', month: 'short' })}` : t('people.never')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {adding && <UserModal onClose={() => setAdding(false)} />}
    </>
  );
}

function UserModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rooms = useQuery({ queryKey: ['classrooms'], queryFn: () => api.get<{ classrooms: Classroom[] }>('/classrooms') });
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'PARENT' as Role });
  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const mutation = useMutation({
    mutationFn: () => api.post('/users', { ...form, phone: form.phone || null, classroomIds: form.role === 'TEACHER' ? classroomIds : [] }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['classrooms'] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={t('people.add')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label={t('people.role')}>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('people.firstName')}>
            <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label={t('people.lastName')}>
            <input className="input" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label={t('people.email')}>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={t('people.phone')}>
          <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label={t('people.password')}>
          <input className="input" type="text" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {form.role === 'TEACHER' && (
          <div>
            <p className="label">{t('people.classrooms')}</p>
            <div className="flex flex-wrap gap-2">
              {rooms.data?.classrooms.map((r) => {
                const on = classroomIds.includes(r.id);
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => setClassroomIds(on ? classroomIds.filter((id) => id !== r.id) : [...classroomIds, r.id])}
                    className="rounded-full px-3 py-1.5 text-sm font-extrabold ring-2"
                    style={on ? { background: r.color, color: '#fff', boxShadow: `0 0 0 2px ${r.color}` } : { background: '#fff' }}
                  >
                    {r.emoji} {r.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
