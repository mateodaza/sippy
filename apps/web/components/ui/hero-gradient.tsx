'use client'

import { LightRays } from '@/components/ui/light-rays'

/**
 * Hero background with animated light effects.
 * Light mode: LightRays component — cheetah blue beams on white.
 * Dark mode: brand blue + crypto green CSS streaks on deep black.
 */
export function HeroGradient({ className = '' }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden bg-[var(--bg-primary)] dark:bg-[#050508] ${className}`}
    >
      {/* ════════════════════════════════════════════════════════════════════
          LIGHT MODE — LightRays (cheetah blue beams on white)
          ════════════════════════════════════════════════════════════════════ */}
      {/* Light mode rays */}
      <div className="absolute inset-0 dark:hidden">
        <LightRays count={12} color="rgba(0, 175, 215, 0.45)" blur={18} speed={10} length="110vh" />
      </div>

      {/* Dark mode rays — layered on top of CSS streaks */}
      <div className="absolute inset-0 hidden dark:block">
        <LightRays count={10} color="rgba(0, 175, 215, 0.25)" blur={24} speed={16} length="110vh" />
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          DARK MODE — brand blue + crypto green CSS streaks on black
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Dark: Blue streaks ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 animate-hero-drift"
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 3%,
              rgba(0,175,215,0.08) 4%,
              transparent 5.5%,
              transparent 8%,
              rgba(0,175,215,0.15) 9%,
              rgba(0,175,215,0.04) 10.5%,
              transparent 12%,
              transparent 16%,
              rgba(0,175,215,0.06) 17%,
              transparent 18%,
              transparent 22%,
              rgba(0,175,215,0.12) 23%,
              rgba(0,175,215,0.20) 24%,
              rgba(0,175,215,0.12) 25%,
              transparent 26.5%,
              transparent 30%,
              rgba(0,175,215,0.03) 31%,
              transparent 32%,
              transparent 36%,
              rgba(0,175,215,0.10) 37%,
              transparent 38.5%,
              transparent 42%,
              rgba(0,175,215,0.18) 43%,
              rgba(0,175,215,0.06) 44.5%,
              transparent 46%,
              transparent 51%,
              rgba(0,175,215,0.08) 52%,
              transparent 53%,
              transparent 57%,
              rgba(0,175,215,0.14) 58%,
              rgba(0,175,215,0.22) 59%,
              rgba(0,175,215,0.14) 60%,
              transparent 61.5%,
              transparent 65%,
              rgba(0,175,215,0.05) 66%,
              transparent 67%,
              transparent 71%,
              rgba(0,175,215,0.10) 72%,
              transparent 73.5%,
              transparent 77%,
              rgba(0,175,215,0.16) 78%,
              rgba(0,175,215,0.06) 79.5%,
              transparent 81%,
              transparent 85%,
              rgba(0,175,215,0.04) 86%,
              transparent 87%,
              transparent 91%,
              rgba(0,175,215,0.12) 92%,
              rgba(0,175,215,0.08) 93.5%,
              transparent 95%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Dark: Green accents ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 animate-hero-drift-slow"
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 6%,
              rgba(0,215,150,0.06) 7%,
              transparent 8%,
              transparent 19%,
              rgba(0,215,150,0.10) 20%,
              rgba(0,215,150,0.04) 21%,
              transparent 22%,
              transparent 35%,
              rgba(0,215,150,0.08) 36%,
              transparent 37.5%,
              transparent 48%,
              rgba(0,215,150,0.05) 49%,
              transparent 50%,
              transparent 63%,
              rgba(0,215,150,0.12) 64%,
              rgba(0,215,150,0.05) 65.5%,
              transparent 67%,
              transparent 79%,
              rgba(0,215,150,0.07) 80%,
              transparent 81.5%,
              transparent 93%,
              rgba(0,215,150,0.09) 94%,
              transparent 95.5%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Dark: Warm neutral streaks ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100 animate-hero-drift-warm"
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 11%,
              rgba(180,170,150,0.04) 12%,
              transparent 13%,
              transparent 27%,
              rgba(200,190,170,0.06) 28%,
              rgba(180,170,150,0.03) 29%,
              transparent 30%,
              transparent 44%,
              rgba(160,150,130,0.05) 45%,
              transparent 46.5%,
              transparent 55%,
              rgba(200,190,170,0.04) 56%,
              transparent 57%,
              transparent 69%,
              rgba(180,170,150,0.07) 70%,
              rgba(160,150,130,0.03) 71%,
              transparent 72.5%,
              transparent 84%,
              rgba(200,190,170,0.05) 85%,
              transparent 86.5%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Dark: Glow spots ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100"
        style={{
          background: `
            radial-gradient(ellipse 2% 70% at 24% 50%, rgba(0,175,215,0.18) 0%, transparent 100%),
            radial-gradient(ellipse 1.5% 60% at 43% 45%, rgba(0,215,150,0.12) 0%, transparent 100%),
            radial-gradient(ellipse 2.5% 80% at 59% 55%, rgba(0,175,215,0.20) 0%, transparent 100%),
            radial-gradient(ellipse 1% 50% at 78% 48%, rgba(0,175,215,0.10) 0%, transparent 100%),
            radial-gradient(ellipse 1.8% 65% at 92% 52%, rgba(0,215,150,0.08) 0%, transparent 100%)
          `,
        }}
      />

      {/* ── Dark: Top/bottom fade ── */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 dark:opacity-100"
        style={{
          background: `
            linear-gradient(180deg,
              rgba(5,5,8,0.7) 0%,
              transparent 25%,
              transparent 75%,
              rgba(5,5,8,0.8) 100%
            )
          `,
        }}
      />

      {/* ── Vignette (both modes) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.12) 100%)',
        }}
      />
    </div>
  )
}
