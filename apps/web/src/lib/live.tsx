import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Role } from '@kidora/shared';
import { useUser } from './auth';
import { useMessageText } from '../pages/Messages';
import { Button } from '../components/ui';

/** Mirrors `LiveEvent` in apps/server/src/lib/live.ts. */
interface LiveEvent {
  type: 'message' | 'activity' | 'attendance' | 'medication';
  childId: string;
  actorId: string;
  actorRole: Role;
  childName: string;
  actorName: string;
  detail?: Record<string, string | null>;
}

interface Toast {
  id: number;
  title: string;
  body: string;
  to: string;
}

/** Queries each event type can change; the REST endpoints stay the source of truth. */
const AFFECTS: Record<LiveEvent['type'], string[][]> = {
  message: [['messages'], ['dashboard'], ['attendance']],
  activity: [['activities'], ['report'], ['notifications'], ['dashboard']],
  attendance: [['attendance'], ['dashboard'], ['children'], ['child']],
  medication: [['medications'], ['activities'], ['report'], ['notifications']],
};

const TOAST_MS = 7000;

/**
 * Keeps one Server-Sent Events connection per tab. Each event refreshes the affected queries,
 * shows an in-app toast and, while the tab is hidden, a browser notification.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const user = useUser();
  const messageText = useMessageText();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  // Read through a ref so the connection isn't torn down when translations or callbacks change.
  const describe = useRef<(e: LiveEvent) => string | null>(() => null);
  describe.current = (e) => {
    const d = e.detail ?? {};
    switch (e.type) {
      case 'message':
        return `${e.actorName}: ${messageText({ template: d.template as never, time: d.time ?? null })}${d.note ? ` · “${d.note}”` : ''}`;
      case 'activity':
        if (d.activityType === 'NAP_END') return t('live.napEnd');
        if (d.activityType === 'INCIDENT_ACK') return t('live.incidentAck');
        return `${t(`daily.types.${d.activityType}` as never)} · ${t('live.by', { name: e.actorName })}`;
      case 'attendance':
        if (d.status === 'PRESENT') return t('live.arrived');
        if (d.status === 'CHECKED_OUT') return t('live.left', { name: d.pickedUpBy ?? '' });
        if (d.status === 'ABSENT') return t('live.absent');
        return null;
      case 'medication':
        return t('live.medicationGiven', { name: d.name ?? '', dose: d.dose ?? '' });
    }
  };

  useEffect(() => {
    const source = new EventSource('/api/events');
    let dropped = false;

    source.onopen = () => {
      // Anything could have happened while we were disconnected.
      if (dropped) void qc.invalidateQueries();
      dropped = false;
    };
    source.onerror = () => {
      dropped = true;
    };
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data as string) as LiveEvent;
      for (const key of AFFECTS[event.type]) void qc.invalidateQueries({ queryKey: key });

      // Your own actions refresh other tabs silently. Staff hear about what families do;
      // parents hear about everything that happens to their child.
      if (event.actorId === user.id) return;
      if (user.role !== 'PARENT' && event.actorRole !== 'PARENT') return;
      const body = describe.current(event);
      if (!body) return;

      const to =
        event.type === 'message'
          ? `/messages/${event.childId}`
          : user.role === 'PARENT'
            ? `/children/${event.childId}/report`
            : `/children/${event.childId}`;
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, title: event.childName, body, to }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), TOAST_MS);

      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification(event.childName, { body, tag: `${event.type}-${event.childId}` });
        n.onclick = () => {
          window.focus();
          window.location.assign(to);
        };
      }
    };
    return () => source.close();
  }, [qc, user.id, user.role]);

  return (
    <>
      {children}
      <Toaster toasts={toasts} onClose={(id) => setToasts((list) => list.filter((x) => x.id !== id))} />
    </>
  );
}

const ASK_KEY = 'kidora.notifyAsked';

function shouldAsk() {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'default' && !localStorage.getItem(ASK_KEY);
  } catch {
    return false;
  }
}

function Toaster({ toasts, onClose }: { toasts: Toast[]; onClose: (id: number) => void }) {
  const { t } = useTranslation();
  const [ask, setAsk] = useState(shouldAsk);
  const dismissAsk = () => {
    try {
      localStorage.setItem(ASK_KEY, '1');
    } catch {
      // Private mode: we'll just ask again next time.
    }
    setAsk(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-end gap-2 md:inset-x-auto md:right-6 md:top-6 md:w-96">
      {ask && (
        <div className="pointer-events-auto w-full rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-line">
          <p className="font-extrabold">🔔 {t('live.askTitle')}</p>
          <p className="mt-1 text-sm text-ink-soft">{t('live.askText')}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismissAsk}>
              {t('live.askNo')}
            </Button>
            <Button size="sm" onClick={() => void Notification.requestPermission().finally(dismissAsk)}>
              {t('live.askYes')}
            </Button>
          </div>
        </div>
      )}
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto flex w-full items-start gap-2 rounded-3xl bg-white p-4 shadow-2xl ring-2 ring-sun animate-[toast-in_.25s_ease-out]">
          <Link to={toast.to} onClick={() => onClose(toast.id)} className="min-w-0 flex-1">
            <p className="truncate font-extrabold">{toast.title}</p>
            <p className="text-sm font-bold text-ink-soft">{toast.body}</p>
          </Link>
          <button onClick={() => onClose(toast.id)} className="rounded-full p-1 text-muted hover:bg-cream-deep" aria-label="Kapat">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
