import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatAge, formatDate, formatTime, fullName } from '../lib/format';
import type { ChildDetail, User } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, ErrorBox, Field, FormError, Modal, Spinner, StatusPill, Tabs } from '../components/ui';
import { ChildFormModal } from './ChildForm';
import { MedicationPlans } from '../components/medications';

type Tab = 'overview' | 'health' | 'meds' | 'family' | 'pickup' | 'history';

export function ChildDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const user = useUser();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['child', id], queryFn: () => api.get<{ child: ChildDetail }>(`/children/${id}`) });

  if (query.isLoading) return <Spinner />;
  if (query.error) return <ErrorBox error={query.error} />;
  const child = query.data!.child;
  const color = child.classroom?.color ?? '#FF7A59';
  const today = child.attendance.find((a) => a.date === new Date().toLocaleDateString('en-CA'));

  return (
    <>
      <Link to={user.role === 'PARENT' ? '/' : '/children'} className="mb-4 inline-flex items-center gap-1 font-extrabold text-ink-soft hover:text-coral">
        <ArrowLeft size={18} /> {user.role === 'PARENT' ? t('nav.dashboard') : t('children.title')}
      </Link>

      <header className="relative mb-6 overflow-hidden rounded-[2.5rem] p-6 md:p-8" style={{ background: `linear-gradient(135deg, ${color}33, ${color}11)` }}>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={fullName(child)} size={96} color={color} className="ring-4 ring-white" />
          <div className="flex-1">
            <h1 className="text-4xl font-extrabold">{fullName(child)}</h1>
            <p className="mt-1 font-bold text-ink-soft">
              {child.classroom ? `${child.classroom.emoji} ${child.classroom.name}` : t('children.noClassroom')} · {formatAge(child.birthDate)} ·{' '}
              {formatDate(child.birthDate, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill status={today?.status ?? 'NOT_ARRIVED'} />
              {child.allergies && (
                <Badge color="#FF7A59">
                  <AlertTriangle size={12} /> {child.allergies}
                </Badge>
              )}
              {child.status === 'INACTIVE' && <Badge color="#8A8292">{t('children.inactive')}</Badge>}
            </div>
          </div>
          <Link to={`/children/${child.id}/report`}>
            <Button>📒 {t('daily.report')}</Button>
          </Link>
          {user.role !== 'PARENT' && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={16} /> {t('common.edit')}
            </Button>
          )}
        </div>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={(['overview', 'health', 'meds', 'family', 'pickup', 'history'] as const).map((id) => ({
          id,
          label: id === 'meds' ? `💊 ${t('meds.tab')}` : t(`children.tabs.${id}`),
        }))}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard title={t('children.guardians')} emoji="👪">
            {child.guardians.length === 0 ? (
              <p className="text-ink-soft">{t('children.noGuardians')}</p>
            ) : (
              child.guardians.map((g) => <PersonRow key={g.user.id} name={fullName(g.user)} sub={g.relationship} phone={g.user.phone} primary={g.isPrimary} />)
            )}
          </InfoCard>
          <InfoCard title={t('children.emergencyContacts')} emoji="🚑">
            {child.emergencyContacts.length === 0 ? (
              <p className="text-ink-soft">{t('children.noEmergency')}</p>
            ) : (
              child.emergencyContacts.map((c) => <PersonRow key={c.id} name={c.fullName} sub={c.relationship} phone={c.phone} />)
            )}
          </InfoCard>
          {child.notes && (
            <InfoCard title={t('children.notes')} emoji="📝">
              <p>{child.notes}</p>
            </InfoCard>
          )}
          <InfoCard title={t('children.photoConsent')} emoji="📷">
            <p className="font-extrabold">{child.photoConsent ? `✓ ${t('common.yes')}` : `✗ ${t('common.no')}`}</p>
          </InfoCard>
        </div>
      )}

      {tab === 'health' && (
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard title={t('children.allergies')} emoji="⚠️">
            <p className={child.allergies ? 'font-extrabold text-coral' : 'text-ink-soft'}>{child.allergies || t('common.none')}</p>
          </InfoCard>
          <InfoCard title={t('children.medicalNotes')} emoji="🩺">
            <p className="text-ink-soft">{child.medicalNotes || t('children.healthEmpty')}</p>
          </InfoCard>
          <InfoCard title={t('children.dietaryNotes')} emoji="🥕">
            <p className="text-ink-soft">{child.dietaryNotes || t('common.none')}</p>
          </InfoCard>
        </div>
      )}

      {tab === 'meds' && <MedicationPlans childId={child.id} />}
      {tab === 'family' && <FamilyTab child={child} />}
      {tab === 'pickup' && <PickupTab child={child} />}

      {tab === 'history' && (
        <InfoCard title={t('children.history')} emoji="📅">
          {child.attendance.length === 0 ? (
            <EmptyState text={t('children.noHistory')} />
          ) : (
            <ul className="divide-y divide-line">
              {child.attendance.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-32 font-extrabold">{formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <StatusPill status={a.status} />
                  <span className="text-sm font-bold text-ink-soft">
                    {a.checkInAt && `↘ ${formatTime(a.checkInAt)}`} {a.checkOutAt && ` · ↗ ${formatTime(a.checkOutAt)} (${a.pickedUpBy})`}
                    {a.absenceNote}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </InfoCard>
      )}

      {editing && <ChildFormModal child={child} onClose={() => setEditing(false)} />}
    </>
  );
}

function InfoCard({ title, emoji, children, action }: { title: string; emoji: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <span>{emoji}</span> {title}
        </h2>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PersonRow({
  name,
  sub,
  phone,
  primary,
  onDelete,
}: {
  name: string;
  sub: string;
  phone?: string | null;
  primary?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5">
      <Avatar name={name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate font-extrabold">
          {name} {primary && <Star size={14} className="fill-sun text-sun" />}
        </p>
        <p className="text-xs font-bold text-muted">{sub}</p>
      </div>
      {phone && (
        <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-mint">
          <Phone size={14} /> <span className="hidden sm:inline">{phone}</span>
        </a>
      )}
      {onDelete && (
        <button onClick={onDelete} className="rounded-full p-2 text-muted hover:bg-rose-soft hover:text-[#b83a62]" aria-label="Sil">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function useInvalidateChild(id: string) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['child', id] });
}

function FamilyTab({ child }: { child: ChildDetail }) {
  const { t } = useTranslation();
  const user = useUser();
  const refresh = useInvalidateChild(child.id);
  const [linking, setLinking] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  // Parents, teachers and the office all keep emergency contacts current; only staff link guardians.
  const canEditContacts = true;
  const isStaff = user.role !== 'PARENT';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InfoCard
        title={t('children.guardians')}
        emoji="👪"
        action={
          isStaff && (
            <Button size="sm" variant="secondary" onClick={() => setLinking(true)}>
              <Plus size={14} /> {t('family.addGuardian')}
            </Button>
          )
        }
      >
        {child.guardians.map((g) => (
          <PersonRow
            key={g.user.id}
            name={fullName(g.user)}
            sub={`${g.relationship} · ${g.user.email}`}
            phone={g.user.phone}
            primary={g.isPrimary}
            onDelete={isStaff ? () => void api.delete(`/children/${child.id}/guardians/${g.user.id}`).then(refresh) : undefined}
          />
        ))}
        {child.guardians.length === 0 && <p className="text-ink-soft">{t('children.noGuardians')}</p>}
      </InfoCard>
      <InfoCard
        title={t('children.emergencyContacts')}
        emoji="🚑"
        action={
          canEditContacts && (
            <Button size="sm" variant="secondary" onClick={() => setAddingContact(true)}>
              <Plus size={14} /> {t('common.add')}
            </Button>
          )
        }
      >
        {child.emergencyContacts.map((c) => (
          <PersonRow
            key={c.id}
            name={c.fullName}
            sub={c.relationship}
            phone={c.phone}
            onDelete={canEditContacts ? () => void api.delete(`/children/${child.id}/emergency-contacts/${c.id}`).then(refresh) : undefined}
          />
        ))}
        {child.emergencyContacts.length === 0 && <p className="text-ink-soft">{t('children.noEmergency')}</p>}
      </InfoCard>
      {linking && <LinkGuardianModal childId={child.id} onClose={() => setLinking(false)} />}
      {addingContact && (
        <ContactModal title={t('children.emergencyContacts')} path={`/children/${child.id}/emergency-contacts`} childId={child.id} phoneRequired onClose={() => setAddingContact(false)} />
      )}
    </div>
  );
}

function PickupTab({ child }: { child: ChildDetail }) {
  const { t } = useTranslation();
  const user = useUser();
  const refresh = useInvalidateChild(child.id);
  const [adding, setAdding] = useState(false);
  const canEdit = true;
  return (
    <InfoCard
      title={t('children.pickupPeople')}
      emoji="🤝"
      action={
        canEdit && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t('common.add')}
          </Button>
        )
      }
    >
      <p className="mb-2 text-sm text-ink-soft">{t('children.pickupHint')}</p>
      {child.pickupPeople.map((p) => (
        <PersonRow
          key={p.id}
          name={p.fullName}
          sub={p.relationship}
          phone={p.phone}
          onDelete={canEdit ? () => void api.delete(`/children/${child.id}/pickup-people/${p.id}`).then(refresh) : undefined}
        />
      ))}
      {child.pickupPeople.length === 0 && <p className="text-ink-soft">{t('children.noPickup')}</p>}
      {adding && <ContactModal title={t('children.pickupPeople')} path={`/children/${child.id}/pickup-people`} childId={child.id} onClose={() => setAdding(false)} />}
    </InfoCard>
  );
}

function ContactModal({
  title,
  path,
  childId,
  phoneRequired,
  onClose,
}: {
  title: string;
  path: string;
  childId: string;
  phoneRequired?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const refresh = useInvalidateChild(childId);
  const [form, setForm] = useState({ fullName: '', relationship: '', phone: '' });
  const mutation = useMutation({
    mutationFn: () => api.post(path, { ...form, phone: form.phone || null }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label={t('children.fullName')}>
          <input className="input" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label={t('children.relationship')}>
          <input className="input" required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
        </Field>
        <Field label={t('children.phone')}>
          <input className="input" type="tel" required={phoneRequired} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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

function LinkGuardianModal({ childId, onClose }: { childId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const refresh = useInvalidateChild(childId);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const parents = useQuery({
    queryKey: ['users', 'PARENT'],
    queryFn: () => api.get<{ users: User[] }>('/users?role=PARENT'),
    enabled: mode === 'existing',
  });
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [relationship, setRelationship] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      mode === 'new'
        ? api.post(`/children/${childId}/guardians/new`, { ...person, phone: person.phone || null, relationship, isPrimary })
        : api.post(`/children/${childId}/guardians`, { userId, relationship, isPrimary }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const needle = search.toLocaleLowerCase('tr');
  const matches = (parents.data?.users ?? []).filter((u) => `${fullName(u)} ${u.email}`.toLocaleLowerCase('tr').includes(needle));
  return (
    <Modal open onClose={onClose} title={t('family.addGuardian')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Tabs<'new' | 'existing'>
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'new', label: t('family.newParent') },
            { id: 'existing', label: t('family.existingParent') },
          ]}
        />
        {mode === 'new' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('family.firstName')}>
                <input className="input" required value={person.firstName} onChange={(e) => setPerson({ ...person, firstName: e.target.value })} />
              </Field>
              <Field label={t('family.lastName')}>
                <input className="input" required value={person.lastName} onChange={(e) => setPerson({ ...person, lastName: e.target.value })} />
              </Field>
            </div>
            <Field label={t('family.email')}>
              <input className="input" type="email" required value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
            </Field>
            <Field label={t('family.phone')}>
              <input className="input" type="tel" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
            </Field>
            <Field label={t('family.tempPassword')} hint={t('family.tempPasswordHint')}>
              <input className="input" required minLength={8} value={person.password} onChange={(e) => setPerson({ ...person, password: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field label={t('roles.PARENT')}>
            <input className="input mb-2" placeholder={t('family.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input" required size={Math.min(6, Math.max(2, matches.length + 1))} value={userId} onChange={(e) => setUserId(e.target.value)}>
              {matches.map((u) => (
                <option key={u.id} value={u.id}>
                  {fullName(u)} ({u.email})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('children.relationship')}>
          <input className="input" required placeholder="Anne, Baba…" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" className="size-5 accent-coral" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
          {t('children.primary')}
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
