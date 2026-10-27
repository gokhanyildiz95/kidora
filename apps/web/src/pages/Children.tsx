import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatAge, fullName } from '../lib/format';
import type { ChildListItem } from '../lib/types';
import { Avatar, Badge, Button, EmptyState, ErrorBox, PageHeader, Spinner, StatusPill } from '../components/ui';
import { ChildFormModal } from './ChildForm';

export function ChildrenPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const query = useQuery({
    queryKey: ['children', q],
    queryFn: () => api.get<{ children: ChildListItem[] }>(`/children?q=${encodeURIComponent(q)}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title={user.role === 'PARENT' ? t('nav.myChildren') : t('children.title')}
        action={
          user.role !== 'PARENT' && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={18} /> {t('children.add')}
            </Button>
          )
        }
      />
      {user.role !== 'PARENT' && (
        <div className="relative mb-5 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input className="input pl-11" placeholder={t('children.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {query.isLoading ? (
        <Spinner />
      ) : query.error ? (
        <ErrorBox error={query.error} />
      ) : query.data!.children.length === 0 ? (
        <EmptyState emoji="🧸" text={t('children.empty')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {query.data!.children.map((c) => (
            <Link key={c.id} to={`/children/${c.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5">
              <Avatar name={fullName(c)} size={56} color={c.classroom?.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold">{fullName(c)}</p>
                <p className="text-sm font-bold text-ink-soft">
                  {c.classroom ? `${c.classroom.emoji} ${c.classroom.name}` : t('children.noClassroom')} · {formatAge(c.birthDate)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <StatusPill status={c.today?.status ?? 'NOT_ARRIVED'} />
                  {c.allergies && (
                    <Badge color="#FF7A59">
                      <AlertTriangle size={11} /> {c.allergies}
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {adding && <ChildFormModal onClose={() => setAdding(false)} />}
    </>
  );
}
