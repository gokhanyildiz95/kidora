import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { AttendanceStatus } from '@kidora/shared';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'mint' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-coral text-white shadow-[var(--shadow-pop)] hover:brightness-105',
  secondary: 'bg-white text-ink ring-2 ring-line hover:ring-coral/40',
  ghost: 'text-ink-soft hover:bg-cream-deep',
  mint: 'bg-mint text-white shadow-[0_4px_0_rgba(45,42,50,0.08)] hover:brightness-105',
  danger: 'bg-rose-soft text-[#c2416b] hover:bg-rose/30',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-extrabold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-3.5 py-1.5 text-sm',
        size === 'md' && 'px-5 py-2.5',
        size === 'lg' && 'px-6 py-3.5 text-lg',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

const avatarPalette = ['#FF7A59', '#FFC94D', '#4CBF98', '#5AB4F0', '#9B8CFF', '#FF8FB1'];

export function Avatar({
  name,
  color,
  size = 44,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('tr'))
    .join('');
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = color ?? avatarPalette[hash % avatarPalette.length];
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

const statusStyles: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-mint-soft text-[#1f7a5c]',
  CHECKED_OUT: 'bg-sky-soft text-[#2172a8]',
  ABSENT: 'bg-rose-soft text-[#b83a62]',
  NOT_ARRIVED: 'bg-sun-soft text-[#9a6a00]',
};

const statusDots: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-mint',
  CHECKED_OUT: 'bg-sky',
  ABSENT: 'bg-rose',
  NOT_ARRIVED: 'bg-sun',
};

export function StatusPill({ status }: { status: AttendanceStatus }) {
  const { t } = useTranslation();
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold', statusStyles[status])}>
      <span className={cx('size-2 rounded-full', statusDots[status])} />
      {t(`status.${status}`)}
    </span>
  );
}

export function Badge({ children, color = '#FFC94D' }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold"
      style={{ background: `${color}26`, color: shade(color) }}
    >
      {children}
    </span>
  );
}

/** Darkens a hex color so tinted badge text stays readable. */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = 0.55;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-extrabold text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ emoji = '🌱', text }: { emoji?: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-blob)] border-2 border-dashed border-line bg-white/60 px-6 py-10 text-center text-ink-soft">
      <span className="text-4xl">{emoji}</span>
      <p className="font-semibold">{text}</p>
    </div>
  );
}

export function Spinner() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-soft" role="status">
      <span className="size-3 animate-bounce rounded-full bg-coral [animation-delay:-0.2s]" />
      <span className="size-3 animate-bounce rounded-full bg-sun [animation-delay:-0.1s]" />
      <span className="size-3 animate-bounce rounded-full bg-mint" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center gap-3 text-center">
      <span className="text-4xl">🙈</span>
      <p className="font-bold">{t('common.error')}</p>
      <p className="text-sm text-ink-soft">{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] bg-cream p-6 shadow-2xl sm:max-w-lg sm:rounded-[2rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-deep" aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-white p-1.5 ring-1 ring-line" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cx(
            'shrink-0 rounded-full px-4 py-2 text-sm font-extrabold transition',
            value === tab.id ? 'bg-coral text-white' : 'text-ink-soft hover:bg-cream-deep',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-2xl bg-rose-soft px-4 py-2.5 text-sm font-bold text-[#b83a62]">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
