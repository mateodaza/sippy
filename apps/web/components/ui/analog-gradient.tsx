'use client';

/**
 * VHS Glitch Waves — warm gray + white noise on brand blue.
 * Horizontal waves + vertical noise (SVG-based, not grid lines).
 * Slow flicker, organic drift, calm chaos.
 * In dark mode: neutral dark gray instead of brand blue (via CSS dark: classes — no flash).
 */
export function AnalogGradient({ className = '', variant = 'primary' }: { className?: string; variant?: 'primary' | 'dark' }) {
  const isDark = variant === 'dark';
  const bg = isDark
    ? 'bg-[#1c2e3c] dark:bg-gradient-to-b dark:from-[#0a0a0a] dark:via-[#111111] dark:to-[#0a0a0a]'
    : 'bg-brand-primary dark:bg-gradient-to-b dark:from-[#0a0a0a] dark:via-[#111111] dark:to-[#0a0a0a]';
  const blend = isDark ? 'mix-blend-screen' : 'mix-blend-soft-light';
  const id = isDark ? 'dark' : 'pri';

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${bg} ${className}`}
    >
      {/* Primary wave — tight gray bands, scrolling up */}
      <div
        className='absolute inset-0 pointer-events-none animate-glitch-wave'
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            rgba(176, 175, 174, ${isDark ? 0.14 : 0.14}) 2px,
            transparent 5px,
            rgba(255, 255, 255, ${isDark ? 0.09 : 0.08}) 7px,
            transparent 10px,
            rgba(176, 175, 174, ${isDark ? 0.12 : 0.10}) 12px,
            transparent 15px,
            rgba(255, 255, 255, ${isDark ? 0.13 : 0.12}) 17px,
            transparent 20px,
            rgba(176, 175, 174, ${isDark ? 0.15 : 0.16}) 22px,
            transparent 26px,
            rgba(255, 255, 255, ${isDark ? 0.07 : 0.06}) 28px,
            transparent 32px
          )`,
          backgroundSize: '100% 32px',
          height: '200%',
        }}
      />

      {/* Secondary wave — wider spacing, opposite direction */}
      <div
        className='absolute inset-0 pointer-events-none animate-glitch-wave-slow'
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            rgba(255, 255, 255, ${isDark ? 0.10 : 0.10}) 3px,
            transparent 8px,
            rgba(176, 175, 174, ${isDark ? 0.13 : 0.12}) 11px,
            transparent 18px,
            rgba(255, 255, 255, ${isDark ? 0.14 : 0.14}) 21px,
            transparent 28px,
            rgba(176, 175, 174, ${isDark ? 0.09 : 0.08}) 31px,
            transparent 38px,
            rgba(255, 255, 255, ${isDark ? 0.12 : 0.11}) 41px,
            transparent 48px
          )`,
          backgroundSize: '100% 48px',
          height: '200%',
        }}
      />

      {/* Third wave — fastest, tight shimmer */}
      <div
        className='absolute inset-0 pointer-events-none animate-glitch-wave-fast'
        style={{
          background: `repeating-linear-gradient(
            0deg,
            transparent 0px,
            rgba(255, 255, 255, ${isDark ? 0.06 : 0.05}) 1px,
            transparent 3px,
            rgba(176, 175, 174, ${isDark ? 0.08 : 0.07}) 4px,
            transparent 6px,
            rgba(255, 255, 255, ${isDark ? 0.05 : 0.04}) 7px,
            transparent 9px
          )`,
          backgroundSize: '100% 9px',
          height: '200%',
        }}
      />

      {/* Horizontal scanlines — warm gray */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          backgroundImage:
            `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(176,175,174,${isDark ? 0.06 : 0.05}) 1px, rgba(176,175,174,${isDark ? 0.06 : 0.05}) 2px)`,
          backgroundSize: '100% 2px',
        }}
      />

      {/* Vertical noise — SVG turbulence stretched horizontally */}
      <svg
        className={`absolute inset-0 w-full h-full pointer-events-none ${isDark ? 'opacity-[0.12]' : 'opacity-[0.09]'} ${blend} animate-glitch-wave-h`}
        style={{ width: '200%' }}
      >
        <filter id={`vhs-vn-${id}`}>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.005 0.8'
            numOctaves='3'
            stitchTiles='stitch'
          />
        </filter>
        <rect
          width='100%'
          height='100%'
          filter={`url(#vhs-vn-${id})`}
          fill='#B0AFAE'
        />
      </svg>

      {/* Second vertical noise layer */}
      <svg
        className={`absolute inset-0 w-full h-full pointer-events-none ${isDark ? 'opacity-[0.08]' : 'opacity-[0.06]'} ${blend} animate-glitch-wave-h-slow`}
        style={{ width: '200%' }}
      >
        <filter id={`vhs-vn2-${id}`}>
          <feTurbulence
            type='turbulence'
            baseFrequency='0.008 0.5'
            numOctaves='2'
            stitchTiles='stitch'
          />
        </filter>
        <rect
          width='100%'
          height='100%'
          filter={`url(#vhs-vn2-${id})`}
          fill='white'
        />
      </svg>

      {/* Flickering tracking lines */}
      <div
        className='absolute left-0 right-0 h-[1px] pointer-events-none animate-vhs-flicker-1'
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 20%, rgba(176,175,174,0.25) 50%, rgba(255,255,255,0.15) 80%, transparent 100%)',
        }}
      />
      <div
        className='absolute left-0 right-0 h-[1px] pointer-events-none animate-vhs-flicker-2'
        style={{
          background:
            'linear-gradient(90deg, transparent 5%, rgba(176,175,174,0.12) 25%, rgba(255,255,255,0.2) 50%, rgba(176,175,174,0.12) 75%, transparent 95%)',
        }}
      />

      {/* Full-coverage static noise */}
      <svg className={`absolute inset-0 w-full h-full pointer-events-none ${isDark ? 'opacity-[0.10]' : 'opacity-[0.08]'} ${blend}`}>
        <filter id={`vhs-gr-${id}`}>
          <feTurbulence
            type='fractalNoise'
            baseFrequency='0.9'
            numOctaves='4'
            stitchTiles='stitch'
          />
        </filter>
        <rect width='100%' height='100%' filter={`url(#vhs-gr-${id})`} fill='#B0AFAE' />
      </svg>

      {/* Heavier noise band — rolls with the wave */}
      <div className='absolute inset-0 pointer-events-none animate-glitch-wave overflow-hidden'>
        <svg
          className={`absolute w-full pointer-events-none ${isDark ? 'opacity-[0.06]' : 'opacity-[0.05]'} ${blend}`}
          style={{ height: '25%', top: '38%' }}
        >
          <filter id={`vhs-grh-${id}`}>
            <feTurbulence
              type='turbulence'
              baseFrequency='1.2 0.4'
              numOctaves='3'
              stitchTiles='stitch'
            />
          </filter>
          <rect width='100%' height='100%' filter={`url(#vhs-grh-${id})`} fill='white' />
        </svg>
      </div>

      {/* Organic blob layer */}
      <div
        className={`absolute pointer-events-none animate-glitch-drift ${isDark ? 'opacity-[0.08]' : 'opacity-[0.08]'}`}
        style={{
          width: '140%',
          height: '140%',
          top: '-20%',
          left: '-20%',
          background: `
            radial-gradient(ellipse 50% 30% at 30% 40%, rgba(255,255,255,0.5) 0%, transparent 70%),
            radial-gradient(ellipse 40% 25% at 70% 65%, rgba(176,175,174,0.6) 0%, transparent 70%),
            radial-gradient(ellipse 35% 20% at 50% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)
          `,
        }}
      />

      {/* Vignette */}
      <div
        className='absolute inset-0 pointer-events-none'
        style={{
          background:
            `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${isDark ? 0.18 : 0.12}) 100%)`,
        }}
      />
    </div>
  );
}
