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
import { LiveStats } from '@/components/ui/live-stats'

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
          {/* Logo S-mark */}
          <a href="/" className="pointer-events-auto flex items-center gap-3 shrink-0">
            <Image
              src="/images/logos/sippy-s-mark-cheetah.svg"
              alt="Sippy"
              width={18}
              height={32}
              className="w-4 sm:w-5 h-auto"
              priority
            />
          </a>
          {/* Centered wordmark — absolute center on viewport */}
          <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-[var(--bg-wordmark-blur)] backdrop-blur-md group-data-[scrolled]/nav:bg-transparent group-data-[scrolled]/nav:backdrop-blur-none transition-all duration-300">
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy"
              width={120}
              height={34}
              className="w-[72px] sm:w-[120px] h-auto"
              priority
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-2 shrink-0">
            <a
              href={`https://wa.me/${SIPPY_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent('Hey Sippy!')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 border border-brand-primary dark:border-brand-primary/25 px-2.5 py-2 sm:px-8 sm:py-3 font-display font-bold text-[9px] sm:text-sm uppercase tracking-wide sm:tracking-widest text-brand-primary dark:text-brand-primary hover:bg-brand-primary dark:hover:bg-brand-primary/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all bg-[var(--bg-primary)]"
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
          <div className="absolute inset-2 sm:inset-8 lg:inset-10 pointer-events-none border border-brand-primary/30 dark:border-brand-primary/15 z-0 rounded-xl sm:rounded-2xl" />
          <div className="absolute inset-3 sm:inset-9 lg:inset-11 pointer-events-none border border-brand-primary/50 dark:border-brand-primary/25 z-0 rounded-[0.7rem] sm:rounded-[1.35rem]" />
          <div className="absolute inset-4 sm:inset-10 lg:inset-12 pointer-events-none border border-brand-primary/80 dark:border-brand-primary/40 z-0 rounded-[0.6rem] sm:rounded-[1.2rem]" />

          {/* Status indicator */}
          <div className="absolute bottom-14 right-14 hidden lg:block z-20">
            <span className="spec-label flex items-center gap-2">
              <span className="indicator-dot indicator-dot-active" />
              {t('landing.status.online', lang)}
            </span>
          </div>

          {/* Hero content — animated gradient streaks */}
          <div className="relative z-10 w-full max-w-[75vw] sm:max-w-none sm:px-14 lg:px-16 mx-auto flex flex-col items-center text-center">
            <div className="w-full relative p-1 min-h-[70vh] sm:min-h-0 flex flex-col dark:shadow-[0_0_80px_rgba(0,175,215,0.15),0_0_160px_rgba(0,175,215,0.08)]">
              <HeroGradient />
              <div className="w-full relative z-10 border border-brand-primary/30 dark:border-brand-primary/40 px-6 py-10 sm:px-14 sm:py-12 lg:px-20 lg:py-14 flex-1 flex flex-col justify-center">
                <BlurFade delay={0.1} yOffset={12}>
                  <h1 className="font-display font-bold text-[2.5rem] sm:text-7xl lg:text-8xl tracking-[-0.04em] text-[var(--text-primary)] mb-4 sm:mb-6 leading-[0.9]">
                    {t('landing.hero.line1', lang)} <br /> {t('landing.hero.line2', lang)}
                  </h1>
                </BlurFade>
                <BlurFade delay={0.3} yOffset={8}>
                  <p className="text-[var(--text-secondary)] text-lg sm:text-2xl md:text-3xl font-light mb-6 sm:mb-8 max-w-2xl mx-auto leading-relaxed">
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
                      className="bg-brand-primary text-white px-6 py-3.5 sm:px-8 sm:py-4 font-bold text-lg sm:text-xl hover:bg-brand-primary-hover transition-all focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] text-center"
                    >
                      {t('landing.hero.openWhatsapp', lang)}
                    </a>
                    <a
                      href="https://fund.sippy.lat"
                      className="bg-transparent border-2 border-brand-primary text-brand-primary px-6 py-3.5 sm:px-8 sm:py-4 font-bold text-lg sm:text-xl hover:bg-brand-primary/10 transition-all focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] text-center"
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

            {/* Live stats readout */}
            <BlurFade delay={1.1} yOffset={4}>
              <div className="mt-4 sm:mt-6 flex justify-center">
                <LiveStats />
              </div>
            </BlurFade>
          </div>
        </section>

        {/* ── Marquee Band — equipment spec readout style ── */}
        {/* REVERT: To restore the blue marquee, replace with: bg-brand-primary text-white border-y border-white/30 */}
        <div
          className="bg-[var(--bg-primary)] text-[var(--text-primary)] py-3 sm:py-6 relative z-20 grid-overlay"
          aria-hidden="true"
        >
          <div className="panel-seam" />
          <Marquee className="[--duration:40s] [--gap:2rem] sm:[--gap:4rem] py-3 sm:py-5">
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
                className="inline-block border border-brand-primary/40 px-3 py-1 sm:px-4 sm:py-1.5 font-mono text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] uppercase whitespace-nowrap"
              >
                <span className="text-brand-primary mr-2">/</span>
                {t(key, lang)}
              </span>
            ))}
          </Marquee>
          <div className="panel-seam" />
        </div>

        {/* ── How It Works ── */}
        <section
          className="py-10 sm:py-16 relative overflow-hidden bg-[var(--bg-primary)]"
          id="how-it-works"
        >
          <div className="max-w-[75vw] sm:max-w-7xl mx-auto sm:px-6 lg:px-8">
            <ScrollReveal>
              <div className="text-center mb-8 sm:mb-16">
                <span className="spec-label block mb-3 sm:mb-4">
                  {t('landing.process.label', lang)}
                </span>
                <h2 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl text-[var(--text-primary)] uppercase">
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
                  <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step1.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-lg">
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
                  <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step2.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-lg">
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
                  <div className="w-32 sm:w-48 aspect-[9/19] border-2 border-[var(--text-primary)] dark:border-brand-primary/60 dark:shadow-[0_0_30px_rgba(0,175,215,0.08),0_0_60px_rgba(0,175,215,0.04)] rounded-[2rem] sm:rounded-[3rem] p-1.5 relative animate-float">
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
                        className="w-10 sm:w-12 h-auto opacity-40"
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
                  <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                    {t('landing.step3.title', lang)}
                  </h3>
                  <p className="text-[var(--text-secondary)] leading-relaxed text-lg">
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
                    <h3 className="font-display font-bold text-2xl text-[var(--text-primary)] uppercase mt-1 mb-3">
                      {t(s.titleKey, lang)}
                    </h3>
                    <p className="text-[var(--text-secondary)] leading-relaxed text-lg">
                      {t(s.descKey, lang)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Under the Hood (Tech Specs) ── */}
        <section className="py-10 sm:py-16 bg-[var(--bg-primary)] relative" id="specs">
          {/* Border frame wrapper — full width, border lines use insets like hero */}
          <div className="relative sm:max-w-[95vw] xl:max-w-[1400px] sm:mx-auto sm:px-6 lg:px-8">
            {/* Gradient border frame — many lines fading outward */}
            <div className="relative">
              {/* Outermost — barely visible, wide on mobile */}
              <div className="absolute inset-x-1 inset-y-0 sm:-inset-[40px] pointer-events-none border border-brand-primary/[0.03] rounded-[0.6rem] sm:rounded-[2.8rem]" />
              <div className="absolute inset-x-1.5 inset-y-[2px] sm:-inset-[34px] pointer-events-none border border-brand-primary/[0.05] rounded-[0.55rem] sm:rounded-[2.6rem]" />
              <div className="absolute inset-x-2 inset-y-1 sm:-inset-[28px] pointer-events-none border border-brand-primary/[0.07] rounded-[0.5rem] sm:rounded-[2.4rem]" />
              <div className="absolute inset-x-2.5 inset-y-1.5 sm:-inset-[22px] pointer-events-none border border-brand-primary/[0.10] rounded-[0.45rem] sm:rounded-[2.2rem]" />
              <div className="absolute inset-x-3 inset-y-2 sm:-inset-[16px] pointer-events-none border border-brand-primary/[0.14] rounded-[0.4rem] sm:rounded-[2rem]" />
              <div className="absolute inset-x-3.5 inset-y-2.5 sm:-inset-[10px] pointer-events-none border border-brand-primary/[0.18] rounded-[0.35rem] sm:rounded-[1.8rem]" />
              <div className="absolute inset-x-4 inset-y-3 sm:-inset-[5px] pointer-events-none border border-brand-primary/[0.24] rounded-[0.3rem] sm:rounded-[1.6rem]" />
              <div className="absolute inset-x-[18px] inset-y-3.5 sm:inset-0 pointer-events-none border border-brand-primary/30 rounded-[0.25rem] sm:rounded-[1.4rem]" />
              <div className="absolute inset-x-5 inset-y-4 sm:inset-[5px] pointer-events-none border border-brand-primary/40 rounded-[0.2rem] sm:rounded-[1.2rem]" />
              <div className="absolute inset-x-[22px] inset-y-[18px] sm:inset-[10px] pointer-events-none border border-brand-primary/50 rounded-[0.15rem] sm:rounded-[1rem]" />
              <div className="absolute inset-x-6 inset-y-5 sm:inset-[15px] pointer-events-none border border-brand-primary/65 rounded-[0.1rem] sm:rounded-[0.8rem]" />
              {/* Innermost — strongest, hugs close to content */}
              <div className="absolute inset-x-[26px] inset-y-[22px] sm:inset-[20px] pointer-events-none border border-brand-primary/80 rounded-[0.05rem] sm:rounded-[0.6rem]" />

              {/* Ruled grid lines inside the frame */}
              <div className="absolute inset-x-[26px] inset-y-[22px] sm:inset-[20px] pointer-events-none rounded-[0.05rem] sm:rounded-[0.6rem] overflow-hidden grid-overlay-lg" />

              <div className="relative z-10 py-12 sm:px-20 sm:py-24 max-w-[75vw] sm:max-w-none mx-auto">
                <ScrollReveal>
                  <div className="text-center mb-8 sm:mb-16">
                    <h2 className="font-display font-bold text-3xl sm:text-5xl md:text-6xl text-[var(--text-primary)] mb-4 sm:mb-6 uppercase">
                      {t('landing.hood.title', lang)}
                    </h2>
                    <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-sm sm:text-xl">
                      {t('landing.hood.desc', lang)}
                    </p>
                  </div>
                </ScrollReveal>

                {/* Asymmetric grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">
                  {/* Large feature — spans 2 rows, emphasized panel-frame */}
                  <ScrollReveal delay={0.1} className="lg:row-span-2">
                    <div className="relative rounded-xl sm:rounded-2xl border-2 border-brand-primary/40 bg-brand-primary/[0.03] dark:bg-brand-primary/[0.06] dark:border-brand-primary/50 overflow-hidden h-full">
                      {/* Inner double border */}
                      <div className="absolute inset-[5px] border border-brand-primary/20 dark:border-brand-primary/30 rounded-lg sm:rounded-xl pointer-events-none" />
                      <div className="rounded-lg sm:rounded-xl p-6 sm:p-8 h-full flex flex-col justify-center relative z-10">
                        <DollarSign className="w-10 h-10 sm:w-14 sm:h-14 text-brand-primary mb-5 sm:mb-8" />
                        <h3 className="font-display font-bold text-3xl sm:text-4xl mb-3 sm:mb-4 text-[var(--text-primary)] uppercase">
                          {t('landing.spec1.title', lang)}
                        </h3>
                        <p className="text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed">
                          {t('landing.spec1.desc', lang)}
                        </p>
                        <div className="mt-5 pt-5 sm:mt-8 sm:pt-8 border-t border-brand-primary/15 dark:border-brand-primary/20 flex flex-wrap gap-3 sm:gap-4">
                          <span className="spec-label">{t('landing.spec1.tag1', lang)}</span>
                          <span className="spec-label">{t('landing.spec1.tag2', lang)}</span>
                        </div>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Arbitrum L2 Speed */}
                  <ScrollReveal delay={0.2} className="h-full">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1 h-full">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-6 h-full">
                        <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary dark:text-brand-primary/80 mb-4 sm:mb-6" />
                        <h3 className="font-display font-bold text-xl sm:text-2xl mb-2 sm:mb-3 text-[var(--text-primary)] uppercase">
                          {t('landing.spec2.title', lang)}
                        </h3>
                        <p className="text-[var(--text-secondary)] text-sm sm:text-lg">
                          {t('landing.spec2.desc', lang)}
                        </p>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Non-Custodial */}
                  <ScrollReveal delay={0.3} className="h-full">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1 h-full">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-6 h-full">
                        <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-brand-primary dark:text-brand-primary/80 mb-4 sm:mb-6" />
                        <h3 className="font-display font-bold text-xl sm:text-2xl mb-2 sm:mb-3 text-[var(--text-primary)] uppercase">
                          {t('landing.spec3.title', lang)}
                        </h3>
                        <p className="text-[var(--text-secondary)] text-sm sm:text-lg">
                          {t('landing.spec3.desc', lang)}
                        </p>
                      </div>
                    </div>
                  </ScrollReveal>

                  {/* Agentic AI — spans 2 cols, with conversation preview */}
                  <ScrollReveal delay={0.4} className="lg:col-span-2">
                    <div className="panel-frame rounded-xl sm:rounded-2xl bg-[var(--bg-primary)] p-1">
                      <div className="bg-[var(--bg-secondary)] rounded-lg sm:rounded-xl p-5 sm:p-6">
                        <div className="flex flex-col md:flex-row items-start gap-5 sm:gap-6">
                          <Bot className="w-12 h-12 text-brand-primary dark:text-brand-primary/80 shrink-0" />
                          <div>
                            <h3 className="font-display font-bold text-2xl mb-2 text-[var(--text-primary)] uppercase">
                              {t('landing.spec4.title', lang)}
                            </h3>
                            <p className="text-[var(--text-secondary)]">
                              {t('landing.spec4.desc', lang)}
                            </p>
                          </div>
                        </div>
                        {/* Simulated conversation */}
                        <div className="mt-4 pt-4 border-t border-brand-primary/10 font-mono text-sm space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="text-brand-primary shrink-0">&gt;</span>
                            <span className="text-[var(--text-primary)]">envía 10 a mama</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-brand-crypto shrink-0">&lt;</span>
                            <span className="text-[var(--text-secondary)]">
                              Listo. 10 USDC enviados a +57 312 *** ****
                            </span>
                          </div>
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
        <section className="py-10 sm:py-16 bg-[var(--bg-primary)] relative" id="use-cases">
          <div className="max-w-[75vw] sm:max-w-5xl mx-auto sm:px-6 lg:px-8 relative">
            <ScrollReveal>
              {/* Header */}
              <div className="mb-8 sm:mb-14 text-center">
                <span className="spec-label">
                  {t('landing.everyone.label', lang) || 'USE CASES'}
                </span>
                <h2 className="font-display font-bold text-3xl sm:text-5xl md:text-6xl text-[var(--text-primary)] mt-3 sm:mt-4 uppercase">
                  {t('landing.everyone.title', lang)}
                </h2>
                <p className="mt-3 sm:mt-4 text-[var(--text-secondary)] text-sm sm:text-xl max-w-xl mx-auto">
                  {t('landing.everyone.desc', lang) || ''}
                </p>
              </div>

              {/* Pills — centered grid */}
              <div className="flex flex-wrap justify-center gap-2.5 sm:gap-4">
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
                    className="panel-frame panel-frame-fill-hover rounded-full px-5 py-3 sm:px-10 sm:py-4 text-[var(--text-primary)] font-display font-bold text-xs sm:text-lg uppercase transition-all cursor-default text-center dark:hover:shadow-[0_0_20px_rgba(0,175,215,0.1)] dark:hover:border-brand-primary/40"
                  >
                    <span className="relative z-10">{t(key, lang)}</span>
                  </div>
                ))}
              </div>

              {/* Spec readout — equipment annotation */}
              <div className="mt-8 sm:mt-12 flex justify-center">
                <div className="panel-seam w-full max-w-md" />
              </div>
              <div className="mt-4 flex justify-center gap-6 sm:gap-10">
                <span className="spec-label spec-label-muted">WHATSAPP</span>
                <span className="spec-label spec-label-muted">USDC</span>
                <span className="spec-label spec-label-muted">ARBITRUM</span>
                <span className="spec-label spec-label-muted">AI AGENT</span>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* ── CTA — Start on WhatsApp ── */}
        <section className="relative py-16 sm:py-32 bg-[var(--bg-primary)] overflow-hidden px-2 sm:px-6 lg:px-8">
          {/* Gradient border bloom — TRON-style, capped at inset-6 on mobile */}
          <div className="absolute inset-0 pointer-events-none border border-brand-primary/[0.02] z-0 rounded-2xl sm:rounded-3xl" />
          <div className="absolute inset-0.5 sm:inset-1 pointer-events-none border border-brand-primary/[0.03] z-0 rounded-[1.1rem] sm:rounded-[1.4rem]" />
          <div className="absolute inset-1 sm:inset-2 pointer-events-none border border-brand-primary/[0.05] z-0 rounded-[1rem] sm:rounded-[1.3rem]" />
          <div className="absolute inset-1.5 sm:inset-3 pointer-events-none border border-brand-primary/[0.08] z-0 rounded-[0.9rem] sm:rounded-[1.2rem]" />
          <div className="absolute inset-2 sm:inset-4 pointer-events-none border border-brand-primary/[0.12] z-0 rounded-[0.85rem] sm:rounded-[1.1rem]" />
          <div className="absolute inset-2.5 sm:inset-5 pointer-events-none border border-brand-primary/[0.16] z-0 rounded-[0.8rem] sm:rounded-[1rem]" />
          <div className="absolute inset-3 sm:inset-6 pointer-events-none border border-brand-primary/[0.22] z-0 rounded-[0.75rem] sm:rounded-[0.95rem]" />
          <div className="absolute inset-3.5 sm:inset-8 pointer-events-none border border-brand-primary/[0.28] z-0 rounded-[0.7rem] sm:rounded-[0.9rem]" />
          <div className="absolute inset-4 sm:inset-10 pointer-events-none border border-brand-primary/[0.35] z-0 rounded-[0.65rem] sm:rounded-[0.85rem]" />
          <div className="absolute inset-4.5 sm:inset-12 pointer-events-none border border-brand-primary/[0.45] z-0 rounded-[0.6rem] sm:rounded-[0.8rem]" />
          <div className="absolute inset-5 sm:inset-14 pointer-events-none border border-brand-primary/[0.55] z-0 rounded-[0.55rem] sm:rounded-[0.7rem]" />
          <div className="absolute inset-5.5 sm:inset-16 pointer-events-none border border-brand-primary/[0.65] z-0 rounded-[0.5rem] sm:rounded-[0.6rem]" />
          <div className="absolute inset-6 sm:inset-[72px] pointer-events-none border border-brand-primary/[0.75] z-0 rounded-[0.45rem] sm:rounded-[0.55rem]" />
          <div className="hidden sm:block absolute sm:inset-20 pointer-events-none border-2 border-brand-primary/[0.90] z-0 rounded-[0.5rem]" />

          <div className="max-w-[75vw] sm:max-w-3xl mx-auto text-center relative z-10">
            <ScrollReveal>
              <span className="spec-label mb-4 block">
                {t('landing.cta.label', lang) || 'GET STARTED'}
              </span>
              <h2 className="font-display font-bold text-4xl sm:text-6xl lg:text-7xl text-[var(--text-primary)] uppercase mb-4 sm:mb-6">
                {t('landing.cta.title', lang)}
              </h2>
              <p className="text-[var(--text-secondary)] text-lg sm:text-2xl mb-8 sm:mb-10 max-w-xl mx-auto">
                {t('landing.cta.desc', lang)}
              </p>
              <a
                href="https://wa.me/14722261449"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 border-2 border-brand-primary text-brand-primary px-7 py-4 sm:px-10 sm:py-5 font-display font-bold text-lg sm:text-xl uppercase tracking-wider hover:bg-brand-primary hover:text-white active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] transition-smooth"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t('landing.cta.button', lang)}
              </a>
              <p className="mt-4 font-mono text-xs text-[var(--text-muted)] tracking-[0.1em] uppercase">
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
                className="mb-3"
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
                <span className="font-mono text-xs text-brand-primary dark:text-brand-primary/70 tracking-[0.2em] uppercase block mb-1">
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
