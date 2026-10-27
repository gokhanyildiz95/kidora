/** Kidora's sun mascot. Purely decorative. */
export function Mascot({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <g stroke="#FFC94D" strokeWidth="8" strokeLinecap="round">
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={60 + Math.cos(a) * 44}
              y1={60 + Math.sin(a) * 44}
              x2={60 + Math.cos(a) * 54}
              y2={60 + Math.sin(a) * 54}
            />
          );
        })}
      </g>
      <circle cx="60" cy="60" r="34" fill="#FFC94D" />
      <circle cx="48" cy="56" r="4.5" fill="#2D2A32" />
      <circle cx="72" cy="56" r="4.5" fill="#2D2A32" />
      <circle cx="42" cy="67" r="5" fill="#FF8FB1" opacity=".7" />
      <circle cx="78" cy="67" r="5" fill="#FF8FB1" opacity=".7" />
      <path d="M49 68q11 10 22 0" stroke="#2D2A32" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="18" fill="#FF7A59" />
        <circle cx="32" cy="30" r="14" fill="#FFC94D" />
        <circle cx="27" cy="28" r="2.4" fill="#2D2A32" />
        <circle cx="37" cy="28" r="2.4" fill="#2D2A32" />
        <path d="M26 34q6 5 12 0" stroke="#2D2A32" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="font-display text-2xl font-extrabold tracking-tight text-ink">
        kid<span className="text-coral">ora</span>
      </span>
    </span>
  );
}
