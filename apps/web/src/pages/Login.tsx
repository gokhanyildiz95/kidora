import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { Button, Field, FormError } from '../components/ui';
import { Logo, Mascot } from '../components/Mascot';

const demoAccounts = [
  { email: 'yonetici@kidora.app', role: 'ADMIN', emoji: '🧑‍💼', color: '#FF7A59' },
  { email: 'ayse@kidora.app', role: 'TEACHER', emoji: '👩‍🏫', color: '#4CBF98' },
  { email: 'veli@kidora.app', role: 'PARENT', emoji: '👨‍👩‍👧', color: '#5AB4F0' },
] as const;

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* playful background blobs */}
      <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-sun/40 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-coral/25 blur-2xl" />
      <div className="pointer-events-none absolute bottom-10 left-10 size-40 rounded-full bg-mint/25 blur-2xl" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-[2.5rem] bg-white shadow-[var(--shadow-soft)] ring-1 ring-line md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-coral to-[#ff9f6e] p-10 text-white md:flex">
          <span className="w-fit rounded-2xl bg-white/95 px-3 py-2">
            <Logo />
          </span>
          <div>
            <Mascot size={140} className="mb-4 drop-shadow-lg" />
            <h2 className="text-4xl font-extrabold">{t('app.tagline')}</h2>
          </div>
          <div className="flex gap-2 text-3xl">🎨 🧸 🌈 🍎 🚲</div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-8 md:p-10">
          <div className="md:hidden">
            <Logo />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold">{t('auth.welcome')}</h1>
            <p className="mt-1 text-ink-soft">{t('auth.subtitle')}</p>
          </div>
          <Field label={t('auth.email')}>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')}>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" disabled={busy}>
            {t('auth.login')}
          </Button>

          <div className="mt-2 rounded-3xl bg-cream p-4">
            <p className="mb-2 text-sm font-extrabold text-ink-soft">{t('auth.demo')}</p>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword('kidora123');
                  }}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 text-xs font-extrabold ring-2 ring-transparent transition hover:ring-coral/30"
                >
                  <span className="flex size-10 items-center justify-center rounded-full text-xl" style={{ background: `${a.color}22` }}>
                    {a.emoji}
                  </span>
                  {t(`roles.${a.role}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t('auth.demoHint')}</p>
          </div>
        </form>
      </div>
    </div>
  );
}
