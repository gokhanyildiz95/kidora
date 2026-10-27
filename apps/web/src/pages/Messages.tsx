import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCheck, Send } from 'lucide-react';
import {
  MESSAGE_NOTE_MAX,
  PARENT_TEMPLATES,
  TEACHER_TEMPLATES,
  TIMED_TEMPLATES,
  URGENT_TEMPLATES,
  type MessageTemplate,
} from '@kidora/shared';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { formatDate, formatTime, fullName, todayIso } from '../lib/format';
import type { Conversation, Message, Thread } from '../lib/types';
import { Avatar, Button, EmptyState, ErrorBox, FormError, PageHeader, Spinner, cx } from '../components/ui';

export function useUnreadMessages() {
  return useQuery({
    queryKey: ['messages', 'unread'],
    queryFn: () => api.get<{ count: number }>('/messages/unread'),
    refetchInterval: 120_000,
    select: (d) => d.count,
  });
}

/** "⏰ Bugün geç geleceğiz · Saat 10:00 gibi" */
export function useMessageText() {
  const { t } = useTranslation();
  return (m: Pick<Message, 'template' | 'time'>) =>
    [t(`messages.templates.${m.template}`), m.time && t('messages.around', { time: m.time })].filter(Boolean).join(' · ');
}

export function MessagesPage() {
  const { t } = useTranslation();
  const { childId } = useParams();
  const threads = useQuery({
    queryKey: ['messages', 'threads'],
    queryFn: () => api.get<{ threads: Thread[] }>('/messages/threads'),
    refetchInterval: 120_000,
  });

  return (
    <>
      <PageHeader title={t('messages.title')} subtitle={t('messages.subtitle')} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <aside className={cx(childId && 'hidden lg:block')}>
          {threads.isLoading ? (
            <Spinner />
          ) : threads.error ? (
            <ErrorBox error={threads.error} />
          ) : threads.data!.threads.length === 0 ? (
            <EmptyState emoji="💬" text={t('messages.noThreads')} />
          ) : (
            <ThreadList threads={threads.data!.threads} activeId={childId} />
          )}
        </aside>
        <section className={cx(!childId && 'hidden lg:block')}>
          {childId ? <ConversationView key={childId} childId={childId} /> : <EmptyState emoji="💬" text={t('messages.pick')} />}
        </section>
      </div>
    </>
  );
}

function ThreadList({ threads, activeId }: { threads: Thread[]; activeId?: string }) {
  const text = useMessageText();
  return (
    <ul className="card space-y-1 p-2">
      {threads.map(({ child, lastMessage, unread }) => (
        <li key={child.id}>
          <Link
            to={`/messages/${child.id}`}
            className={cx('flex items-center gap-3 rounded-2xl px-3 py-2.5 transition', activeId === child.id ? 'bg-coral-soft' : 'hover:bg-cream')}
          >
            <Avatar name={fullName(child)} size={46} color={child.classroom?.color} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-extrabold">{fullName(child)}</p>
                {lastMessage && (
                  <span className="shrink-0 text-xs font-bold text-muted">
                    {lastMessage.createdAt.slice(0, 10) === todayIso() ? formatTime(lastMessage.createdAt) : formatDate(lastMessage.createdAt, { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={cx('truncate text-sm', unread ? 'font-extrabold text-ink' : 'text-ink-soft')}>
                  {lastMessage ? text(lastMessage) : child.classroom ? `${child.classroom.emoji} ${child.classroom.name}` : ''}
                </p>
                {unread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-coral px-1.5 text-xs font-extrabold text-white">{unread}</span>
                )}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ConversationView({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const user = useUser();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const text = useMessageText();
  const bottom = useRef<HTMLDivElement>(null);

  const convo = useQuery({
    queryKey: ['messages', 'conversation', childId],
    queryFn: async () => {
      const data = await api.get<Conversation>(`/messages/${childId}`);
      // Opening marks it read on the server; refresh badges.
      void qc.invalidateQueries({ queryKey: ['messages', 'unread'] });
      void qc.invalidateQueries({ queryKey: ['messages', 'threads'] });
      return data;
    },
    refetchInterval: 120_000,
  });

  const count = convo.data?.messages.length ?? 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  if (convo.isLoading) return <Spinner />;
  if (convo.error) return <ErrorBox error={convo.error} />;
  const { child, messages, seenUntil } = convo.data!;
  const color = child.classroom?.color ?? '#FF7A59';
  const others =
    user.role === 'PARENT'
      ? (child.classroom?.staff ?? []).map(fullName).join(', ')
      : child.guardians.map((g) => `${fullName(g.user)} (${g.relationship})`).join(', ');
  const lastMine = [...messages].reverse().find((m) => m.senderId === user.id);

  return (
    <div className="card flex flex-col p-0">
      <header className="flex items-center gap-3 rounded-t-[var(--radius-blob)] px-4 py-3" style={{ background: `${color}22` }}>
        <button className="rounded-full p-1.5 hover:bg-white/60 lg:hidden" onClick={() => navigate('/messages')} aria-label="Geri">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={fullName(child)} size={44} color={color} />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{fullName(child)}</p>
          <p className="truncate text-xs font-bold text-ink-soft">
            {user.role === 'PARENT' ? t('messages.teachers') : t('messages.family')}: {others || '—'}
          </p>
        </div>
      </header>

      <div className="max-h-[52vh] min-h-64 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm font-semibold text-ink-soft">{t('messages.empty')}</p>}
        {messages.map((m, i) => {
          const mine = m.senderId === user.id;
          const showDay = i === 0 || messages[i - 1]!.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
          const urgent = URGENT_TEMPLATES.includes(m.template);
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center text-xs font-extrabold uppercase tracking-wide text-muted">
                  {formatDate(m.createdAt, { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              )}
              <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cx(
                    'max-w-[85%] rounded-3xl px-4 py-2.5',
                    mine ? 'rounded-br-lg bg-coral text-white' : 'rounded-bl-lg bg-cream',
                    urgent && !mine && 'ring-2 ring-rose',
                  )}
                >
                  {!mine && m.sender && <p className="mb-0.5 text-xs font-extrabold text-ink-soft">{fullName(m.sender)}</p>}
                  {m.template !== 'OTHER' && <p className="font-extrabold">{text(m)}</p>}
                  {m.note && <p className={cx(m.template !== 'OTHER' && 'text-sm', mine ? 'text-white/90' : 'text-ink-soft', m.template === 'OTHER' && 'font-bold text-inherit')}>{m.note}</p>}
                  <p className={cx('mt-1 flex items-center justify-end gap-1 text-[11px] font-bold', mine ? 'text-white/80' : 'text-muted')}>
                    {formatTime(m.createdAt)}
                    {mine && m.id === lastMine?.id && seenUntil && new Date(seenUntil) >= new Date(m.createdAt) && (
                      <>
                        <CheckCheck size={13} /> {t('messages.seen')}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <Composer childId={childId} />
    </div>
  );
}

function Composer({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const user = useUser();
  const qc = useQueryClient();
  const templates: readonly MessageTemplate[] = user.role === 'PARENT' ? PARENT_TEMPLATES : TEACHER_TEMPLATES;
  const [template, setTemplate] = useState<MessageTemplate | null>(null);
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');

  const send = useMutation({
    mutationFn: () => api.post(`/messages/${childId}`, { template, time: time || null, note: note || null }),
    onSuccess: () => {
      setTemplate(null);
      setTime('');
      setNote('');
      void qc.invalidateQueries({ queryKey: ['messages'] });
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  return (
    <form
      className="space-y-3 border-t border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (template) send.mutate();
      }}
    >
      <p className="label">{t('messages.quick')}</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((tp) => (
          <button
            type="button"
            key={tp}
            onClick={() => setTemplate(template === tp ? null : tp)}
            className={cx(
              'rounded-full px-3.5 py-2 text-sm font-extrabold ring-2 transition',
              template === tp ? 'bg-coral text-white ring-coral' : 'bg-white ring-line hover:ring-coral/40',
            )}
          >
            {t(`messages.templates.${tp}`)}
          </button>
        ))}
      </div>
      {template && (
        <div className="flex flex-wrap items-end gap-3">
          {TIMED_TEMPLATES.includes(template) && (
            <label className="w-32">
              <span className="label">{t('messages.time')}</span>
              <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          )}
          <label className="min-w-48 flex-1">
            <span className="label">{template === 'OTHER' ? t('messages.noteRequired') : t('messages.note')}</span>
            <input
              className="input"
              maxLength={MESSAGE_NOTE_MAX}
              required={template === 'OTHER'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoFocus={template === 'OTHER'}
            />
          </label>
          <Button type="submit" disabled={send.isPending}>
            <Send size={16} /> {t('messages.send')}
          </Button>
        </div>
      )}
      <FormError error={send.error} />
    </form>
  );
}
