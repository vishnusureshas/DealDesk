import { useEffect, useState } from 'react';

export default function LoadingScreen({ label = 'Loading your workspace' }) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 92 ? p : p + Math.random() * 14));
    }, 220);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative grid h-dvh w-full place-items-center overflow-hidden bg-[#070b18] text-white">
      <style>{`
        @keyframes ld-gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes ld-pulse {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50% { transform: scale(1.18); opacity: 0.15; }
        }
        @keyframes ld-orbit {
          0% { transform: rotate(0deg) translateX(54px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(54px) rotate(-360deg); }
        }
        @keyframes ld-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes ld-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      {/* animated gradient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 30%, rgba(59,108,246,0.35), transparent 70%), radial-gradient(50% 45% at 80% 70%, rgba(124,58,237,0.28), transparent 70%), radial-gradient(40% 40% at 50% 50%, rgba(14,165,233,0.18), transparent 70%)',
          backgroundSize: '200% 200%',
          animation: 'ld-gradient 12s ease infinite',
        }}
      />

      {/* grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      {/* soft floating orbs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl"
        style={{ animation: 'ld-float 6s ease-in-out infinite' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-1/4 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
        style={{ animation: 'ld-float 7s ease-in-out infinite reverse' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        {/* logo mark with orbiting dots */}
        <div className="relative grid h-24 w-24 place-items-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-3xl bg-brand-500/20"
            style={{ animation: 'ld-pulse 2.4s ease-in-out infinite' }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-2 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-2xl shadow-brand-500/40"
          />
          <span className="relative text-2xl font-bold tracking-tight text-white">
            DD
          </span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg shadow-white/40"
              style={{
                animation: `ld-orbit ${2.6 + i * 0.4}s linear infinite`,
                animationDelay: `${i * 0.3}s`,
                opacity: 0.9 - i * 0.2,
              }}
            />
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-300">
            DealDesk
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {label}
          </h1>
          <p className="text-sm text-slate-400">
            Syncing deals, approvals and invoices…
          </p>
        </div>

        {/* progress bar */}
        <div className="w-64 max-w-[80vw]">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 via-violet-400 to-sky-400 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(progress, 96)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Connecting to your workspace
          </div>
        </div>
      </div>
    </div>
  );
}
