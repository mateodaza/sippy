/**
 * Sippy Landing Page — Analog Tech aesthetic
 * Teenage Engineering meets Cheetah EP: equipment panels, spec labels,
 * registration marks, indicator lights. Warm, precise, inviting.
 */

import Image from 'next/image'
import { Zap, Lock, Bot, DollarSign } from 'lucide-react'
import { Marquee } from '@/components/ui/marquee'
import { AnalogGradient } from '@/components/ui/analog-gradient'
import { HeroGradient } from '@/components/ui/hero-gradient'
import ScrollNav from '@/components/ui/scroll-nav'
import { LiveClock } from '@/components/ui/live-clock'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import BlurFade from '@/components/ui/blur-fade'
import { getRequestLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/ui/language-switcher'

const SIPPY_NUMBER = process.env.NEXT_PUBLIC_SIPPY_WHATSAPP_NUMBER || '+1 (472) 226-1449'

export default async function HomePage() {
  const lang = await getRequestLang()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] font-sans text-[var(--text-primary)] antialiased">
      {/* Skip to content — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:bg-[var(--bg-primary)] focus:px-4 focus:py-2 focus:border focus:border-brand-primary focus:text-brand-primary focus:font-mono focus:text-sm"
      >
        {t('landing.skip', lang)}
      </a>
      {/* ── Floating Nav ── */}
      <ScrollNav>
        <div className="max-w-7xl mx-auto px-3 sm:px-8 lg:px-12 py-3 sm:py-4 flex justify-between items-center gap-2 relative">
          {/* Logo badge — equipment panel style */}
          <a href="/" className="pointer-events-auto flex items-center gap-3 shrink-0">
            <div className="bg-brand-primary dark:bg-black w-8 h-10 sm:w-10 sm:h-14 flex items-center justify-center dark:border dark:border-white/15">
              <Image
                src="/images/logos/sippy-s-mark-white.svg"
                alt="Sippy"
                width={18}
                height={32}
                className="w-3.5 sm:w-[18px] h-auto"
                priority
              />
            </div>
          </a>
          {/* Centered wordmark — absolute center on viewport */}
          <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-[var(--bg-wordmark-blur)] backdrop-blur-md group-data-[scrolled]/nav:bg-transparent group-data-[scrolled]/nav:backdrop-blur-none transition-all duration-300">
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy"
              width={120}
              height={34}
              className="w-[72px] sm:w-[120px] h-auto dark:hidden"
              priority
            />
            <Image
              src="/images/logos/sippy-wordmark-white.svg"
              alt="Sippy"
              width={120}
              height={34}
              className="w-[72px] sm:w-[120px] h-auto hidden dark:block"
              priority
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-2 shrink-0">
            <a
              href={`https://wa.me/${SIPPY_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent('Hey Sippy!')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 border border-brand-primary dark:border-white/20 px-2.5 py-2 sm:px-8 sm:py-3 font-display font-bold text-[9px] sm:text-sm uppercase tracking-wide sm:tracking-widest text-brand-primary dark:text-white hover:bg-brand-primary dark:hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all bg-[var(--bg-primary)]"
            >
              <span className="sm:hidden">{t('landing.nav.tryIt', lang)}</span>
              <span className="hidden sm:inline">{t('landing.nav.openWhatsapp', lang)}</span>
            </a>
          </div>
        </div>
      </ScrollNav>

      <main id="main-content">
        {/* ── Hero ── */}
        <section className="relative h-screen max-h-[900px] pt-16 sm:pt-20 pb-8 sm:pb-12 overflow-hidden flex flex-col justify-center items-center bg-[var(--bg-primary)] px-2 sm:px-6 lg:px-8 registration-marks">
          {/* Triple nested border frames — rounded outer, echoing equipment housing */}
          <div className="absolute inset-2 sm:inset-8 lg:inset-10 pointer-events-none border border-brand-primary/30 dark:border-brand-primary/[0.12] z-0 rounded-xl sm:rounded-2xl" />
          <div className="absolute inset-3 sm:inset-9 lg:inset-11 pointer-events-none border border-brand-primary/50 dark:border-brand-primary/[0.20] z-0 rounded-[0.7rem] sm:rounded-[1.35rem]" />
          <div className="absolute inset-4 sm:inset-10 lg:inset-12 pointer-events-none border border-brand-primary/80 dark:border-brand-primary/[0.30] z-0 rounded-[0.6rem] sm:rounded-[1.2rem]" />

          {/* Status indicator */}
          <div className="absolute bottom-14 right-14 hidden lg:block z-20">
            <span className="spec-label flex items-center gap-2">
              <span className="indicator-dot indicator-dot-active" />
              {t('landing.status.online', lang)}
            </span>
          </div>

          {/* Hero content */}
          <div className="relative z-10 w-full max-w-[75vw] sm:max-w-none sm:px-14 lg:px-16 mx-auto flex flex-col items-center text-center">
            {/* Main hero panel — analog tape effect */}
            <div className="w-full relative p-1 min-h-[70vh] sm:min-h-0 flex flex-col dark:shadow-[0_0_80px_rgba(0,175,215,0.15),0_0_160px_rgba(0,175,215,0.08)]">
              <HeroGradient />
              <div className="w-full relative z-10 border border-white/30 dark:border-brand-primary/40 px-6 py-10 sm:px-14 sm:py-12 lg:px-20 lg:py-14 flex-1 flex flex-col justify-center">
                <BlurFade delay={0.1} yOffset={12}>
                  <h1 className="font-display font-bold text-[2.5rem] sm:text-6xl lg:text-8xl tracking-[-0.04em] text-white mb-4 sm:mb-6 leading-[0.9]">
                    {t('landing.hero.line1', lang)} <br /> {t('landing.hero.line2', lang)}
                  </h1>
                </BlurFade>
                <BlurFade delay={0.3} yOffset={8}>
                  <p className="text-white/90 text-base sm:text-xl md:text-2xl font-light mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
                    {t('landing.hero.sub1', lang)}
                    <br />
                    {t('landing.hero.sub2', lang)}
                  </p>
                </BlurFade>
                <BlurFade delay={0.5} yOffset={8}>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 justify-center w-full max-w-md mx-auto">
                    <a
                      href={`https://wa.me/${SIPPY_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent('Hey Sippy!')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-brand-primary dark:text-black px-6 py-3.5 sm:px-8 sm:py-4 font-bold text-base sm:text-lg hover:bg-brand-primary-light dark:hover:bg-white/90 transition-all border border-white/30 dark:shadow-[0_0_24px_rgba(255,255,255,0.08)] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary text-center"
                    >
                      {t('landing.hero.openWhatsapp', lang)}
                    </a>
                    <a
                      href="https://fund.sippy.lat"
                      className="bg-transparent border-2 border-white text-white px-6 py-3.5 sm:px-8 sm:py-4 font-bold text-base sm:text-lg hover:bg-white/10 transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary text-center"
                    >
                      {t('landing.hero.fundPhone', lang)}
                    </a>
                  </div>
                </BlurFade>
              </div>
            </div>

            {/* Data readout — inline with hero */}
            <div className="mt-4 sm:mt-8 flex justify-center gap-2 sm:gap-8 flex-wrap">
              {(
                ['landing.tags.1', 'landing.tags.2', 'landing.tags.3', 'landing.tags.4'] as const
              ).map((key, i) => (
                <BlurFade key={key} delay={0.7 + i * 0.1} yOffset={4}>
                  <span className="font-mono text-[9px] sm:text-xs font-bold tracking-[0.1em] sm:tracking-[0.2em] uppercase text-[var(--text-secondary)] border border-[var(--border-strong)] px-2 py-0.5 sm:px-3 sm:py-1">
                    {t(key, lang)}
                  </span>
                </BlurFade>
              ))}
            </div>
          </div>
        </section>

        {/* ── Marquee Band ── */}
        <div
          className="bg-brand-primary dark:bg-[#0a0a0a] text-white py-3 sm:py-6 border-y border-white/30 dark:border-brand-primary/25 dark:shadow-[0_0_40px_rgba(0,175,215,0.10),inset_0_1px_0_rgba(0,175,215,0.15),inset_0_-1px_0_rgba(0,175,215,0.15)] relative z-20"
          aria-hidden="true"
        >
          <Marquee className="[--duration:40s] [--gap:2rem] sm:[--gap:4rem]">
            {(
              [
                'landing.marquee.1',
                'landing.marquee.2',
                'landing.marquee.3',
                'landing.marquee.4',
              ] as const
            ).map((key, i) => (
              <span
                key={i}
                className="inline-block border border-white/40 dark:border-brand-primary/30 dark:shadow-[0_0_16px_rgba(0,175,215,0.08)] px-3 py-1 sm:px-4 sm:py-1.5 font-mono text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase whitespace-nowrap"
              >
                <span className="text-white/60 dark:text-brand-primary mr-2">/</span>
                {t(key, lang)}
              </span>
            ))}
          </Marquee>
        </div>

        {/* ── How It Works ── */}
        <section
          className="py-12 sm:py-24 relative overflow-hidden bg-[var(--bg-primary)]"
          id="how-it-works"
        >
          <div className="max-w-[75vw] sm:max-w-7xl mx-auto sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-8 sm:mb-16">
                <span className="spec-label block mb-3 sm:mb-4">
                  {t('landing.process.label', lang)}
                </span>
                <h2 className="font-display font-bold text-3xl sm:text-5xl lg:text-6xl text-[var(--text-primary)] uppercase">
                  {t('landing.process.title', lang)}
                </h2>
              </div>
            </ScrollReveal>

            {/* Nokia ad layout — phone centered, steps flanking */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-16 items-center max-w-5xl mx-auto">
              {/* Left column — Steps 01 & 02 */}
              <ScrollReveal
                direction="left"
                className="space-y-12 text-right hidden lg:block max-w-xs ml-auto"
                aria-hidden="true"
              >
                <div>
                  <span className="font-mono text-sm text-brand-primary dark:text-brand-primary font-bold tracking-wider">
                    {t('landing.step1.num', lang)}
                  </span>
                  <h3 className="font-display font-bold text-xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step1.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-base">
                    {t('landing.step1.desc.desktop', lang)
                      .split('\n')
                      .map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))}
                  </p>
                </div>
                <div>
                  <span className="font-mono text-sm text-brand-primary dark:text-brand-primary font-bold tracking-wider">
                    {t('landing.step2.num', lang)}
                  </span>
                  <h3 className="font-display font-bold text-xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step2.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-base">
                    {t('landing.step2.desc.desktop', lang)
                      .split('\n')
                      .map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))}
                  </p>
                </div>
              </ScrollReveal>

              {/* Center — modern phone silhouette */}
              <ScrollReveal direction="up" delay={0.15}>
                <div className="flex flex-col items-center">
                  <div className="w-32 sm:w-48 aspect-[9/19] border-2 border-[var(--text-primary)] dark:border-white/60 dark:shadow-[0_0_30px_rgba(0,175,215,0.08),0_0_60px_rgba(0,175,215,0.04)] rounded-[2rem] sm:rounded-[3rem] p-1.5 relative animate-float">
                    {/* Inner screen bezel */}
                    <div className="w-full h-full rounded-[2rem] sm:rounded-[2.5rem] border border-[var(--border-strong)] flex items-center justify-center relative overflow-hidden">
                      {/* Dynamic island */}
                      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-14 sm:w-16 h-3 sm:h-3.5 rounded-full bg-[var(--text-primary)]/80" />

                      {/* S mark on screen */}
                      <Image
                        src="/images/logos/sippy-s-mark-cheetah.svg"
                        alt="Sippy"
                        width={50}
                        height={88}
                        className="w-10 sm:w-12 h-auto opacity-40 dark:hidden"
                      />
                      <Image
                        src="/images/logos/sippy-s-mark-white.svg"
                        alt="Sippy"
                        width={50}
                        height={88}
                        className="w-10 sm:w-12 h-auto opacity-40 hidden dark:block"
                      />
                    </div>
                  </div>
                </div>
              </ScrollReveal>

              {/* Right column — Step 03 + tagline */}
              <ScrollReveal
                direction="right"
                delay={0.3}
                className="space-y-12 hidden lg:block max-w-xs"
                aria-hidden="true"
              >
                <div>
                  <span className="font-mono text-sm text-brand-primary dark:text-brand-primary font-bold tracking-wider">
                    {t('landing.step3.num', lang)}
                  </span>
                  <h3 className="font-display font-bold text-xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step3.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-base">
                    {t('landing.step3.desc.desktop', lang)
                      .split('\n')
                      .map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))}
                  </p>
                </div>
                <div className="pt-4">
                  <p className="text-[var(--text-secondary)] text-sm leading-relaxed">
                    {t('landing.step3.note', lang)
                      .split('\n')
                      .map((line, i) => (
                        <span key={i}>
                          {i > 0 && <br />}
                          {line}
                        </span>
                      ))}
                  </p>
                </div>
              </ScrollReveal>

              {/* Mobile: stacked steps (hidden on desktop) */}
              <div className="lg:hidden space-y-5 sm:space-y-8">
                {(
                  [
                    {
                      stepKey: 'landing.step1.num',
                      titleKey: 'landing.step1.title',
                      descKey: 'landing.step1.desc',
                    },
                    {
                      stepKey: 'landing.step2.num',
                      titleKey: 'landing.step2.title',
                      descKey: 'landing.step2.desc',
                    },
                    {
                      stepKey: 'landing.step3.num',
                      titleKey: 'landing.step3.title',
                      descKey: 'landing.step3.desc',
                    },
                  ] as const
                ).map((s) => (
                  <div key={s.stepKey} className="panel-frame rounded-xl sm:rounded-2xl p-4 sm:p-6">
                    <span className="font-mono text-sm text-brand-primary dark:text-brand-primary font-bold tracking-wider">
                      {t(s.stepKey, lang)}
                    </span>
                    <h3 className="font-display font-bold text-xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                      {t(s.titleKey, lang)}
                    </h3>
                    <p className="text-[var(--text-secondary)] leading-relaxed text-base">
                      {t(s.descKey, lang)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Under the Hood (Tech Specs) ── */}
        <section className="py-12 sm:py-24 bg-[var(--bg-primary)] relative" id="specs">
          {/* Border frame wrapper — full width, border lines use insets like hero */}
          <div className="relative sm:max-w-[95vw] xl:max-w-[1400px] sm:mx-auto sm:px-6 lg:px-8">
            {/* Gradient border frame — many lines fading outward */}
            <div className="relative">
              {/* Outermost — barely visible, wide on mobile */}
              <div className="absolute inset-x-1 inset-y-0 sm:-inset-[40px] pointer-events-none border border-brand-primary/[0.03] dark:border-white/[0.03] rounded-[0.6rem] sm:rounded-[2.8rem]" />
              <div className="absolute inset-x-1.5 inset-y-[2px] sm:-inset-[34px] pointer-events-none border border-brand-primary/[0.05] dark:border-white/[0.04] rounded-[0.55rem] sm:rounded-[2.6rem]" />
              <div className="absolute inset-x-2 inset-y-1 sm:-inset-[28px] pointer-events-none border border-brand-primary/[0.07] dark:border-white/[0.06] rounded-[0.5rem] sm:rounded-[2.4rem]" />
              <div className="absolute inset-x-2.5 inset-y-1.5 sm:-inset-[22px] pointer-events-none border border-brand-primary/[0.10] dark:border-white/[0.07] rounded-[0.45rem] sm:rounded-[2.2rem]" />
              <div className="absolute inset-x-3 inset-y-2 sm:-inset-[16px] pointer-events-none border border-brand-primary/[0.14] dark:border-white/[0.10] rounded-[0.4rem] sm:rounded-[2rem]" />
              <div className="absolute inset-x-3.5 inset-y-2.5 sm:-inset-[10px] pointer-events-none border border-brand-primary/[0.18] dark:border-white/[0.13] rounded-[0.35rem] sm:rounded-[1.8rem]" />
              <div className="absolute inset-x-4 inset-y-3 sm:-inset-[5px] pointer-events-none border border-brand-primary/[0.24] dark:border-white/[0.16] rounded-[0.3rem] sm:rounded-[1.6rem]" />
              <div className="absolute inset-x-[18px] inset-y-3.5 sm:inset-0 pointer-events-none border border-brand-primary/30 dark:border-white/20 rounded-[0.25rem] sm:rounded-[1.4rem]" />
              <div className="absolute inset-x-5 inset-y-4 sm:inset-[5px] pointer-events-none border border-brand-primary/40 dark:border-white/25 rounded-[0.2rem] sm:rounded-[1.2rem]" />
              <div className="absolute inset-x-[22px] inset-y-[18px] sm:inset-[10px] pointer-events-none border border-brand-primary/50 dark:border-white/30 rounded-[0.15rem] sm:rounded-[1rem]" />
              <div className="absolute inset-x-6 inset-y-5 sm:inset-[15px] pointer-events-none border border-brand-primary/65 dark:border-white/40 rounded-[0.1rem] sm:rounded-[0.8rem]" />
              {/* Innermost — strongest, hugs close to content */}
              <div className="absolute inset-x-[26px] inset-y-[22px] sm:inset-[20px] pointer-events-none border border-brand-primary/80 dark:border-white/50 rounded-[0.05rem] sm:rounded-[0.6rem]" />

              {/* Ruled grid lines inside the frame */}
              <div className="absolute inset-x-[26px] inset-y-[22px] sm:inset-[20px] pointer-events-none rounded-[0.05rem] sm:rounded-[0.6rem] overflow-hidden grid-overlay-lg" />

              <div className="relative z-10 py-12 sm:px-20 sm:py-24 max-w-[75vw] sm:max-w-none mx-auto">
                <ScrollReveal>
                  <div className="text-center mb-8 sm:mb-16">
                    <h2 className="font-display font-bold text-2xl sm:text-4xl md:text-5xl text-[var(--text-primary)] mb-4 sm:mb-6 uppercase">
                      {t('landing.hood.title', lang)}
                    </h2>
                    <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-sm sm:text-lg">
                      {t('landing.hood.desc', lang)}
                    </p>
                  </div>
                </ScrollReveal>

                {/* Asymmetric grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
                  {/* Large feature — spans 2 rows, brand accent */}
                  <ScrollReveal delay={0.1} className="lg:row-span-2">
                    <div className="rounded-xl sm:rounded-2xl bg-brand-primary dark:bg-[var(--bg-secondary)] dark:border dark:border-brand-primary/40 dark:shadow-[0_0_60px_rgba(0,175,215,0.12),0_0_120px_rgba(0,175,215,0.06)] p-1 relative overflow-hidden h-full">
                      <div className="rounded-lg sm:rounded-xl p-6 sm:p-10 h-full flex flex-col justify-center relative z-10">
                        <DollarSign className="w-10 h-10 sm:w-14 sm:h-14 text-white/80 dark:text-brand-primary mb-5 sm:mb-8" />
                        <h3 className="font-display font-bold text-2xl sm:text-3xl mb-3 sm:mb-4 text-white uppercase">
                          {t('landing.spec1.title', lang)}
                        </h3>
                        <p className="text-base sm:text-lg text-white/80 leading-relaxed">
                          {t('landing.spec1.desc', lang)}
                        </p>
                        <div className="mt-5 pt-5 sm:mt-8 sm:pt-8 border-t border-white/20 flex flex-wrap gap-3 sm:gap-4">
                          <span className="spec-label spec-label-light">
                            {t('landing.spec1.tag1', lang)}
                          </span>
                          <span className="spec-label spec-label-light">
                            {t('landing.spec1.tag2', lang)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Arbitrum L2 Speed */}
                  <ScrollReveal delay={0.2} className="h-full">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1 h-full">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-8 h-full">
                        <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary dark:text-brand-primary/80 mb-4 sm:mb-6" />
                        <h3 className="font-display font-bold text-lg sm:text-xl mb-2 sm:mb-3 text-[var(--text-primary)] uppercase">
                          {t('landing.spec2.title', lang)}
                        </h3>
                        <p className="text-[var(--text-secondary)] text-sm sm:text-base">
                          {t('landing.spec2.desc', lang)}
                        </p>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Non-Custodial */}
                  <ScrollReveal delay={0.3} className="h-full">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1 h-full">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-8 h-full">
                        <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary dark:text-brand-primary/80 mb-4 sm:mb-6" />
                        <h3 className="font-display font-bold text-lg sm:text-xl mb-2 sm:mb-3 text-[var(--text-primary)] uppercase">
                          {t('landing.spec3.title', lang)}
                        </h3>
                        <p className="text-[var(--text-secondary)] text-sm sm:text-base">
                          {t('landing.spec3.desc', lang)}
                        </p>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Agentic AI — spans 2 cols */}
                  <ScrollReveal delay={0.4} className="lg:col-span-2">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-8 flex flex-col md:flex-row items-start gap-5 sm:gap-8">
                        <Bot className="w-12 h-12 text-brand-primary dark:text-brand-primary/80 shrink-0" />
                        <div>
                          <h3 className="font-display font-bold text-xl mb-2 text-[var(--text-primary)] uppercase">
                            {t('landing.spec4.title', lang)}
                          </h3>
                          <p className="text-[var(--text-secondary)]">
                            {t('landing.spec4.desc', lang)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Built for Everyone + TV ── */}
        <section className="py-12 sm:py-24 bg-[var(--bg-primary)]" id="use-cases">
          <div className="max-w-[75vw] sm:max-w-7xl mx-auto sm:px-6 lg:px-8 relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
              {/* Left — use case pills */}
              <ScrollReveal direction="left">
                <div className="mb-6 sm:mb-12">
                  <h2 className="font-display font-bold text-2xl sm:text-4xl md:text-5xl text-[var(--text-primary)] mb-4 sm:mb-6 uppercase">
                    {t('landing.everyone.title', lang)}
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5 sm:gap-5">
                  {(
                    [
                      'landing.pill.1',
                      'landing.pill.2',
                      'landing.pill.3',
                      'landing.pill.4',
                      'landing.pill.5',
                      'landing.pill.6',
                    ] as const
                  ).map((key) => (
                    <div
                      key={key}
                      className="panel-frame panel-frame-fill-hover rounded-full px-4 py-2.5 sm:px-10 sm:py-4 text-[var(--text-primary)] font-display font-bold text-xs sm:text-base uppercase transition-all cursor-default text-center dark:hover:shadow-[0_0_20px_rgba(0,175,215,0.1)] dark:hover:border-brand-primary/40"
                    >
                      <span className="relative z-10">{t(key, lang)}</span>
                    </div>
                  ))}
                </div>
              </ScrollReveal>

              {/* Right — TV */}
              <ScrollReveal direction="right" delay={0.2}>
                <div className="crt-tv max-w-xs sm:max-w-sm mx-auto lg:ml-auto">
                  <div className="crt-screen relative aspect-[4/3]">
                    <AnalogGradient variant="dark" />
                    <div className="analog-band" />

                    <div
                      className="absolute left-0 right-0 h-[1px] pointer-events-none animate-vhs-flicker-1 z-30"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 20%, rgba(176,175,174,0.2) 50%, rgba(255,255,255,0.12) 80%, transparent 100%)',
                      }}
                    />
                    <div
                      className="absolute left-0 right-0 h-[1px] pointer-events-none animate-vhs-flicker-2 z-30"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 5%, rgba(176,175,174,0.1) 25%, rgba(255,255,255,0.15) 50%, rgba(176,175,174,0.1) 75%, transparent 95%)',
                      }}
                    />

                    <div className="absolute inset-0 z-10 flex flex-col justify-end p-4 sm:p-6">
                      <div>
                        <div
                          className="crt-fringe font-mono font-black text-xl sm:text-2xl text-white crt-glow tracking-wide mb-2 leading-none whitespace-nowrap"
                          data-text={SIPPY_NUMBER}
                        >
                          {SIPPY_NUMBER}
                        </div>
                        <p className="text-white/60 text-[10px] sm:text-xs font-mono tracking-widest uppercase whitespace-nowrap">
                          {t('landing.crt.footer', lang)}
                        </p>
                      </div>
                    </div>

                    <div className="absolute top-3 right-4 sm:top-4 sm:right-5 z-20">
                      <LiveClock className="font-mono text-[9px] text-white/50 tracking-widest" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 sm:mt-3 px-2">
                    <span className="font-mono text-[8px] text-brand-primary/60 dark:text-white/40 tracking-[0.3em] uppercase">
                      sippy
                    </span>
                    <div className="flex gap-2 items-center">
                      <div className="w-3 h-3 rounded-full border border-brand-primary/30 dark:border-white/20" />
                      <div className="w-3 h-3 rounded-full border border-brand-primary/30 dark:border-white/20" />
                      <div className="w-3.5 h-3.5 rounded-full border border-brand-primary/30 dark:border-white/20" />
                      <div className="w-3.5 h-3.5 rounded-full border border-brand-primary/30 dark:border-white/20" />
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* ── CTA — Start on WhatsApp ── */}
        <section className="relative py-16 sm:py-32 bg-brand-primary dark:bg-[var(--bg-secondary)] overflow-hidden px-2 sm:px-6 lg:px-8">
          {/* Triple nested border frames — inverse hero (white on blue), tighter to content */}
          <div className="absolute inset-2 sm:inset-4 lg:inset-6 pointer-events-none border border-white/20 dark:border-white/8 z-0 rounded-xl sm:rounded-2xl" />
          <div className="absolute inset-3 sm:inset-5 lg:inset-7 pointer-events-none border border-white/35 dark:border-white/12 z-0 rounded-[0.7rem] sm:rounded-[0.85rem]" />
          <div className="absolute inset-4 sm:inset-6 lg:inset-8 pointer-events-none border border-white/50 dark:border-white/15 z-0 rounded-[0.6rem] sm:rounded-[0.7rem]" />

          <div className="max-w-[75vw] sm:max-w-3xl mx-auto text-center relative z-10">
            <ScrollReveal>
              <h2 className="font-display font-bold text-3xl sm:text-5xl lg:text-6xl text-white uppercase mb-4 sm:mb-6">
                {t('landing.cta.title', lang)}
              </h2>
              <p className="text-white/70 text-base sm:text-xl mb-8 sm:mb-10 max-w-xl mx-auto">
                {t('landing.cta.desc', lang)}
              </p>
              <a
                href="https://wa.me/14722261449"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-white text-brand-primary dark:bg-transparent dark:text-white dark:border dark:border-brand-primary/40 dark:shadow-[0_0_20px_rgba(0,175,215,0.08)] px-7 py-4 sm:px-10 sm:py-5 font-display font-bold text-base sm:text-lg uppercase tracking-wider hover:bg-white/90 dark:hover:bg-brand-primary/10 dark:hover:border-brand-primary/60 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-white dark:focus-visible:ring-brand-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary dark:focus-visible:ring-offset-black transition-smooth"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t('landing.cta.button', lang)}
              </a>
              <p className="mt-3 font-mono text-xs text-white/60 dark:text-white/40 tracking-[0.1em] uppercase">
                {t('landing.cta.trust', lang)}
              </p>
            </ScrollReveal>
          </div>
        </section>
      </main>

      {/* ── Footer — Spec Sheet ── */}
      <footer className="bg-[var(--bg-primary)] border-t border-[var(--border-strong)] relative overflow-hidden">
        {/* Ruled grid background */}
        <div className="absolute inset-0 pointer-events-none grid-overlay" />

        <div className="max-w-[75vw] sm:max-w-7xl mx-auto sm:px-6 lg:px-8 relative z-10">
          {/* Top row — logo + nav refs */}
          <div className="py-10 sm:py-14 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-start">
            {/* Left — wordmark + descriptor */}
            <div>
              <Image
                src="/images/logos/sippy-wordmark-cheetah.svg"
                alt="Sippy"
                width={100}
                height={28}
                className="mb-3 dark:hidden"
              />
              <Image
                src="/images/logos/sippy-wordmark-white.svg"
                alt="Sippy"
                width={100}
                height={28}
                className="mb-3 hidden dark:block"
              />
              <p className="font-mono text-sm text-[var(--text-secondary)] tracking-[0.12em] uppercase leading-relaxed max-w-xs">
                {t('landing.footer.desc', lang)
                  .split('\n')
                  .map((line, i) => (
                    <span key={i}>
                      {i > 0 && <br />}
                      {line}
                    </span>
                  ))}
              </p>
            </div>

            {/* Right — system reference links */}
            <nav className="flex flex-wrap gap-x-5 sm:gap-x-8 gap-y-3 font-mono text-sm tracking-[0.12em] sm:tracking-[0.15em] uppercase">
              {[
                { labelKey: 'landing.footer.features' as const, href: '#specs' },
                { labelKey: 'landing.footer.fund' as const, href: 'https://fund.sippy.lat' },
                { labelKey: 'landing.footer.about' as const, href: '/about' },
                { labelKey: 'landing.footer.support' as const, href: '/support' },
                { labelKey: 'landing.footer.contact' as const, href: 'mailto:hello@sippy.lat' },
              ].map((link) => (
                <a
                  key={link.labelKey}
                  href={link.href}
                  className="text-[var(--text-secondary)] hover:text-brand-primary focus-visible:text-brand-primary focus-visible:outline-none transition-smooth py-1"
                >
                  {t(link.labelKey, lang)}
                </a>
              ))}
            </nav>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-strong)]" />

          {/* Spec readout row */}
          <div className="py-6 sm:py-8 grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
            {(
              [
                { labelKey: 'landing.readout.1.label', valueKey: 'landing.readout.1.value' },
                { labelKey: 'landing.readout.2.label', valueKey: 'landing.readout.2.value' },
                { labelKey: 'landing.readout.3.label', valueKey: 'landing.readout.3.value' },
                { labelKey: 'landing.readout.4.label', valueKey: 'landing.readout.4.value' },
              ] as const
            ).map((spec) => (
              <div key={spec.labelKey}>
                <span className="font-mono text-xs text-brand-primary dark:text-white/70 tracking-[0.2em] uppercase block mb-1">
                  {t(spec.labelKey, lang)}
                </span>
                <span className="font-mono text-sm text-[var(--text-primary)] tracking-wide">
                  {t(spec.valueKey, lang)}
                </span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border-strong)]" />

          {/* Legal disclosure */}
          <div className="py-4 sm:py-6 font-mono text-[10px] sm:text-xs text-[var(--text-muted)] tracking-wide leading-relaxed space-y-1">
            <p>{t('landing.footer.disclaimer', lang)}</p>
            <p>{t('landing.footer.legal', lang)}</p>
          </div>

          <div className="border-t border-[var(--border-strong)]" />

          {/* Bottom row — legal + version stamp */}
          <div className="py-6 sm:py-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4 sm:gap-6 font-mono text-sm text-[var(--text-secondary)] tracking-[0.12em] sm:tracking-[0.15em] uppercase">
              <span>{t('landing.footer.copyright', lang)}</span>
              <a
                href="/terms"
                className="hover:text-brand-primary focus-visible:text-brand-primary focus-visible:outline-none transition-smooth py-1"
              >
                {t('landing.footer.terms', lang)}
              </a>
              <a
                href="/privacy"
                className="hover:text-brand-primary focus-visible:text-brand-primary focus-visible:outline-none transition-smooth py-1"
              >
                {t('landing.footer.privacy', lang)}
              </a>
            </div>
            <div className="flex items-center gap-4">
              <div className="font-mono text-xs text-[var(--text-muted)] tracking-[0.2em] uppercase flex items-center gap-3">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-crypto/40" />
                {t('landing.footer.version', lang)}
              </div>
              <LanguageSwitcher current={lang} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
