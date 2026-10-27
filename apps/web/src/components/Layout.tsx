import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Baby, CalendarDays, ClipboardCheck, Home, LogOut, MessageCircleHeart, NotebookPen, School, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@kidora/shared';
import { useAuth, useUser } from '../lib/auth';
import { setLanguage } from '../i18n';
import { fullName } from '../lib/format';
import { Avatar, cx } from './ui';
import { Logo } from './Mascot';
import { useUnreadMessages } from '../pages/Messages';
import { NotificationBell } from './NotificationBell';
import { MedicationBanner } from './medications';
import { LiveProvider } from '../lib/live';
import { useNotifications } from './NotificationBell';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  color: string;
  /** Shows the unread message count */
  badge?: boolean;
}

function useNav(): NavItem[] {
  const { t } = useTranslation();
  return [
    { to: '/', label: t('nav.dashboard'), icon: Home, roles: ['ADMIN', 'TEACHER', 'PARENT'], color: '#FF7A59' },
    { to: '/attendance', label: t('nav.attendance'), icon: ClipboardCheck, roles: ['ADMIN', 'TEACHER'], color: '#4CBF98' },
    { to: '/messages', label: t('messages.nav'), icon: MessageCircleHeart, roles: ['ADMIN', 'TEACHER', 'PARENT'], color: '#FF7A59', badge: true },
    { to: '/daily', label: t('daily.nav'), icon: NotebookPen, roles: ['ADMIN', 'TEACHER'], color: '#FFB547' },
    { to: '/children', label: t('nav.children'), icon: Baby, roles: ['ADMIN', 'TEACHER'], color: '#5AB4F0' },
    { to: '/children', label: t('nav.myChildren'), icon: Baby, roles: ['PARENT'], color: '#5AB4F0' },
    { to: '/classrooms', label: t('nav.classrooms'), icon: School, roles: ['ADMIN', 'TEACHER'], color: '#9B8CFF' },
    { to: '/people', label: t('nav.people'), icon: Users, roles: ['ADMIN'], color: '#FF8FB1' },
    { to: '/calendar', label: t('nav.calendar'), icon: CalendarDays, roles: ['ADMIN', 'TEACHER', 'PARENT'], color: '#5AB4F0' },
  ];
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  return (
    <div className="flex rounded-full bg-cream-deep p-1 text-xs font-extrabold">
      {(['tr', 'en'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className={cx('rounded-full px-2.5 py-1 uppercase', i18n.language === lang ? 'bg-white text-ink shadow' : 'text-muted')}
        >
          {lang}
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const user = useUser();
  const { logout } = useAuth();
  const items = useNav().filter((i) => i.roles.includes(user.role));
  const unread = useUnreadMessages().data ?? 0;
  const unseen = useNotifications(user.role === 'PARENT').data?.unread ?? 0;

  // "(3) Kidora" in the tab title, so a background tab still shows something is waiting.
  useEffect(() => {
    const total = unread + unseen;
    document.title = total > 0 ? `(${total}) Kidora` : 'Kidora';
  }, [unread, unseen]);

  return (
    <LiveProvider>
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar: fixed so logout stays on screen however long the page is; the spacer keeps its width in the layout */}
      <div className="hidden w-64 shrink-0 md:block" />
      <aside className="fixed inset-y-0 left-0 z-40 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-white/70 p-5 backdrop-blur md:flex">
        <div className="flex items-start justify-between gap-2">
          <Logo />
          {user.role === 'PARENT' && <NotificationBell />}
        </div>
        <p className="mt-1 text-xs font-bold text-muted">{user.schoolName}</p>
        <nav className="-mx-2 mt-8 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          {items.map((item) => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 font-extrabold transition',
                  isActive ? 'bg-cream-deep text-ink' : 'text-ink-soft hover:bg-cream',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className="flex size-9 items-center justify-center rounded-xl transition"
                    style={{ background: isActive ? item.color : `${item.color}22`, color: isActive ? '#fff' : item.color }}
                  >
                    <item.icon size={19} strokeWidth={2.5} />
                  </span>
                  {item.label}
                  {item.badge && unread > 0 && (
                    <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-coral px-1.5 text-xs font-extrabold text-white">{unread}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 shrink-0 space-y-4">
          <LanguageToggle />
          <div className="flex items-center gap-3 rounded-2xl bg-cream p-3">
            <Avatar name={fullName(user)} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">{fullName(user)}</p>
              <p className="text-xs font-bold text-muted">{t(`roles.${user.role}`)}</p>
            </div>
            <button onClick={() => void logout()} className="rounded-full p-2 text-muted hover:bg-white hover:text-coral" title={t('nav.logout')}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-cream/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          {user.role === 'PARENT' && <NotificationBell align="right" />}
          <LanguageToggle />
          <button onClick={() => void logout()} className="rounded-full p-2 text-muted" aria-label={t('nav.logout')}>
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10">
        {user.role !== 'PARENT' && <MedicationBanner />}
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around overflow-x-auto rounded-[1.75rem] bg-white p-2 shadow-[var(--shadow-soft)] ring-1 ring-line md:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to + item.label}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cx('flex min-w-16 flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-extrabold', isActive ? 'text-ink' : 'text-muted')
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="relative flex size-9 items-center justify-center rounded-xl"
                  style={{ background: isActive ? item.color : 'transparent', color: isActive ? '#fff' : item.color }}
                >
                  <item.icon size={20} strokeWidth={2.5} />
                  {item.badge && unread > 0 && (
                    <span className="absolute -right-1.5 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-extrabold text-white ring-2 ring-white">
                      {unread}
                    </span>
                  )}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
    </LiveProvider>
  );
}
