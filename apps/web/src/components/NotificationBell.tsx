import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import type { NotificationItem } from '../lib/types';
import { ActivityIcon, useDescribe } from './activity';
import { Button, cx } from './ui';

function browserPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Parents' recent daily-feed entries. Live events refresh it; the slow poll is only a fallback. */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ unread: number; items: NotificationItem[] }>('/notifications'),
    refetchInterval: 120_000,
    enabled,
  });
}

/** Parents' bell: new daily-feed entries for their children. */
export function NotificationBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const describe = useDescribe();
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(browserPermission());
  const query = useNotifications();
  const seen = useMutation({
    mutationFn: () => api.post('/notifications/seen'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = query.data?.unread ?? 0;
  const items = query.data?.items ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 text-ink-soft hover:bg-cream-deep"
        aria-label={t('notifications.title')}
      >
        <Bell size={21} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-extrabold text-white ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cx(
              'absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[1.75rem] bg-white p-3 shadow-2xl ring-1 ring-line',
              align === 'right' ? 'right-0' : 'left-0',
            )}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-lg font-extrabold">{t('notifications.title')}</p>
              {unread > 0 && (
                <button className="text-xs font-extrabold text-coral" onClick={() => seen.mutate()}>
                  {t('notifications.markSeen')}
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {items.length === 0 && <li className="px-2 py-6 text-center text-sm text-ink-soft">{t('notifications.empty')}</li>}
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/children/${item.childId}/report?date=${item.date}`}
                    onClick={() => setOpen(false)}
                    className={cx('flex items-center gap-3 rounded-2xl px-2 py-2', item.unread ? 'bg-coral-soft/60' : 'hover:bg-cream')}
                  >
                    <ActivityIcon type={item.type} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">
                        {item.child?.firstName} · {t(`daily.types.${item.type}`)}
                      </p>
                      <p className="truncate text-xs text-ink-soft">{describe(item)}</p>
                    </div>
                    <span className="text-xs font-bold text-muted">{formatTime(item.occurredAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {permission === 'default' && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2 w-full"
                onClick={() => void Notification.requestPermission().then(setPermission)}
              >
                🔔 {t('notifications.enableBrowser')}
              </Button>
            )}
            {permission === 'granted' && <p className="mt-2 text-center text-xs font-bold text-mint">✓ {t('notifications.browserOn')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
