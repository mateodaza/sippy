'use client';

/**
 * Interstellar-inspired vertical light streaks for the hero section.
 * Dark mode: brand blue + crypto green streaks on deep black.
 * Light mode: white + gray + blue streaks on brand blue.
 * Slow, elegant drift — cinematic, not noisy.
 * CSS dark: classes prevent FOUC.
 */
export function HeroGradient({ className = '' }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden bg-brand-primary dark:bg-[#050508] ${className}`}
    >
      {/* ── Base: subtle vertical noise texture ── */}
      <svg className='absolute inset-0 w-full h-full pointer-events-none opacity-[0.06] dark:opacity-0' style={{ mixBlendMode: 'screen' }}>
        <filter id='hero-noise'>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.8 0.01'
            numOctaves='3'
            stitchTiles='stitch'
          />
        </filter>
        <rect width='100%' height='100%' filter='url(#hero-noise)' fill='white' />
      </svg>

      {/* ════════════════════════════════════════════════════════════════════
          LIGHT MODE — white/gray/blue streaks on brand blue bg
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Light: White streaks — primary ── */}
      <div
        className='absolute inset-0 pointer-events-none dark:opacity-0 animate-hero-drift'
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 3%,
              rgba(255,255,255,0.10) 4%,
              transparent 5.5%,
              transparent 8%,
              rgba(255,255,255,0.18) 9%,
              rgba(255,255,255,0.06) 10.5%,
              transparent 12%,
              transparent 16%,
              rgba(255,255,255,0.08) 17%,
              transparent 18%,
              transparent 22%,
              rgba(255,255,255,0.14) 23%,
              rgba(255,255,255,0.25) 24%,
              rgba(255,255,255,0.14) 25%,
              transparent 26.5%,
              transparent 30%,
              rgba(255,255,255,0.05) 31%,
              transparent 32%,
              transparent 36%,
              rgba(255,255,255,0.12) 37%,
              transparent 38.5%,
              transparent 42%,
              rgba(255,255,255,0.20) 43%,
              rgba(255,255,255,0.08) 44.5%,
              transparent 46%,
              transparent 51%,
              rgba(255,255,255,0.10) 52%,
              transparent 53%,
              transparent 57%,
              rgba(255,255,255,0.16) 58%,
              rgba(255,255,255,0.28) 59%,
              rgba(255,255,255,0.16) 60%,
              transparent 61.5%,
              transparent 65%,
              rgba(255,255,255,0.06) 66%,
              transparent 67%,
              transparent 71%,
              rgba(255,255,255,0.12) 72%,
              transparent 73.5%,
              transparent 77%,
              rgba(255,255,255,0.18) 78%,
              rgba(255,255,255,0.08) 79.5%,
              transparent 81%,
              transparent 85%,
              rgba(255,255,255,0.05) 86%,
              transparent 87%,
              transparent 91%,
              rgba(255,255,255,0.14) 92%,
              rgba(255,255,255,0.08) 93.5%,
              transparent 95%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Light: Gray/cool streaks — depth ── */}
      <div
        className='absolute inset-0 pointer-events-none dark:opacity-0 animate-hero-drift-slow'
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 6%,
              rgba(200,210,220,0.08) 7%,
              transparent 8%,
              transparent 14%,
              rgba(180,195,210,0.12) 15%,
              rgba(200,210,220,0.05) 16%,
              transparent 17.5%,
              transparent 25%,
              rgba(220,225,230,0.10) 26%,
              transparent 27.5%,
              transparent 38%,
              rgba(190,200,215,0.14) 39%,
              rgba(200,210,220,0.06) 40.5%,
              transparent 42%,
              transparent 52%,
              rgba(180,195,210,0.08) 53%,
              transparent 54.5%,
              transparent 63%,
              rgba(220,225,230,0.12) 64%,
              rgba(200,210,220,0.05) 65.5%,
              transparent 67%,
              transparent 76%,
              rgba(190,200,215,0.10) 77%,
              transparent 78.5%,
              transparent 88%,
              rgba(200,210,220,0.07) 89%,
              transparent 90.5%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Light: Darker blue accent streaks ── */}
      <div
        className='absolute inset-0 pointer-events-none dark:opacity-0 animate-hero-drift-warm'
        style={{
          background: `
            linear-gradient(90deg,
              transparent 0%,
              transparent 10%,
              rgba(0,130,180,0.08) 11%,
              transparent 12.5%,
              transparent 28%,
              rgba(0,110,160,0.10) 29%,
              rgba(0,130,180,0.04) 30%,
              transparent 31.5%,
              transparent 46%,
              rgba(0,120,170,0.06) 47%,
              transparent 48.5%,
              transparent 58%,
              rgba(0,130,180,0.12) 59%,
              rgba(0,110,160,0.05) 60.5%,
              transparent 62%,
              transparent 74%,
              rgba(0,120,170,0.08) 75%,
              transparent 76.5%,
              transparent 90%,
              rgba(0,130,180,0.06) 91%,
              transparent 92.5%,
              transparent 100%
            )
          `,
        }}
      />

      {/* ── Light: Glow spots ── */}
      <div
        className='absolute inset-0 pointer-events-none dark:opacity-0'
        style={{
          background: `
            radial-gradient(ellipse 3% 70% at 24% 50%, rgba(255,255,255,0.15) 0%, transparent 100%),
            radial-gradient(ellipse 2% 60% at 43% 45%, rgba(220,230,240,0.10) 0%, transparent 100%),
            radial-gradient(ellipse 3.5% 80% at 59% 55%, rgba(255,255,255,0.18) 0%, transparent 100%),
            radial-gradient(ellipse 1.5% 50% at 78% 48%, rgba(255,255,255,0.08) 0%, transparent 100%),
            radial-gradient(ellipse 2.5% 65% at 92% 52%, rgba(220,230,240,0.10) 0%, transparent 100%)
          `,
        }}
      />

      {/* ── Light: Edge fade ── */}
      <div
        className='absolute inset-0 pointer-events-none dark:opacity-0'
        style={{
          background: `
            linear-gradient(180deg,
              rgba(0,152,189,0.4) 0%,
              transparent 20%,
              transparent 80%,
              rgba(0,152,189,0.5) 100%
            )
          `,
        }}
      />

      {/* ════════════════════════════════════════════════════════════════════
          DARK MODE — brand blue + crypto green on black
          ════════════════════════════════════════════════════════════════════ */}

      {/* ── Dark: Blue streaks ── */}
      <div
        className='absolute inset-0 pointer-events-none opacity-0 dark:opacity-0 animate-hero-drift'
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
        className='absolute inset-0 pointer-events-none opacity-0 dark:opacity-0 animate-hero-drift-slow'
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
        className='absolute inset-0 pointer-events-none opacity-0 dark:opacity-0 animate-hero-drift-warm'
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
        className='absolute inset-0 pointer-events-none opacity-0 dark:opacity-0'
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
        className='absolute inset-0 pointer-events-none opacity-0 dark:opacity-100'
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

      {/* ── Vignette ── */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.25) 100%)',
        }}
      />
    </div>
  );
}
