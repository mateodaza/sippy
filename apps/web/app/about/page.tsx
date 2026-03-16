/**
 * Sippy About Page
 * For partners, investors, and the Arbitrum ecosystem
 */

import Image from 'next/image';
import Link from 'next/link';
import {
  Shield,
  Lock,
  Eye,
  ArrowUpRight,
  CheckCircle2,
  Globe,
  Bot,
  Zap,
  Trophy,
} from 'lucide-react';
import BlurFade from '@/components/ui/blur-fade';
import ScrollNav from '@/components/ui/scroll-nav';
import { getRequestLang } from '@/lib/i18n-server';
import { t } from '@/lib/i18n';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

export const metadata = {
  title: 'About Sippy - WhatsApp USDC Payments on Arbitrum',
  description:
    'Sippy is a USDC payment agent on Arbitrum One for Latin America. Send, receive, and hold dollars through WhatsApp. No app, no seed phrases, no crypto knowledge.',
  openGraph: {
    title: 'About Sippy - WhatsApp USDC Payments on Arbitrum',
    description:
      'USDC payment agent on Arbitrum One for Latin America. Dollars on WhatsApp.',
    type: 'website',
  },
};

export default async function AboutPage() {
  const lang = await getRequestLang();

  return (
    <main className='min-h-screen' id='main-content'>
      {/* Navigation */}
      <ScrollNav>
        <div className='max-w-7xl mx-auto px-6 py-4 flex justify-between items-center'>
          <Link
            href='/'
            className='flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg'
          >
            <Image
              src='/images/logos/sippy-wordmark-electric.svg'
              alt='Sippy - go to homepage'
              width={148}
              height={43}
              priority
              className='transition-smooth hover:scale-105'
            />
          </Link>
          <ThemeToggle />
        </div>
      </ScrollNav>

      {/* Hero */}
      <section className='relative overflow-hidden py-12 sm:py-24'>
        <div className='relative z-10 max-w-[75vw] sm:max-w-3xl mx-auto text-center'>
          <div className='flex flex-wrap gap-3 items-center justify-center mb-8'>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-crypto-light border border-brand-crypto/20 rounded-full text-sm text-[var(--text-primary)] animate-fade-in-up'>
              <CheckCircle2 className='w-4 h-4 text-brand-crypto' />
              <span className='font-medium'>{t('about.badge.live', lang)}</span>
            </div>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-crypto-light border border-brand-crypto/20 rounded-full text-sm text-[var(--text-primary)] animate-fade-in-up animation-delay-100'>
              <Zap className='w-4 h-4 text-brand-crypto' />
              <span className='font-medium'>{t('about.badge.launch', lang)}</span>
            </div>
          </div>

          <h1 className='font-display text-4xl md:text-5xl lg:text-[3.5rem] font-bold uppercase text-[var(--text-primary)] leading-[1.08] tracking-[-0.025em] mb-6 animate-fade-in-up animation-delay-100'>
            {t('about.hero.title.line1', lang)}
            <br />
            <span className='text-brand-crypto'>{t('about.hero.title.line2', lang)}</span>
          </h1>

          <p className='text-lg md:text-xl text-[var(--text-secondary)] leading-[1.75] max-w-2xl mx-auto animate-fade-in-up animation-delay-200'>
            {t('about.hero.desc', lang)}
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-4xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-[var(--text-primary)] text-center mb-16 leading-[1.08] tracking-[-0.02em]'>
            {t('about.how.title.before', lang)}{' '}
            <span className='text-brand-crypto'>{t('about.how.title.accent', lang)}</span>
          </h2>

          <div className='relative'>
            <div className='hidden md:block absolute top-7 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-brand-primary/15 dark:bg-white/10' />

            <div className='grid md:grid-cols-3 gap-12 md:gap-8'>
              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  1
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>{t('about.step1.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.step1.desc', lang)}
                </p>
              </div>

              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  2
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>{t('about.step2.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.step2.desc', lang)}
                </p>
              </div>

              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  3
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>{t('about.step3.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.step3.desc', lang)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-3xl mx-auto'>
          <BlurFade delay={0.1} inView>
            <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-[var(--text-primary)] text-center mb-6 leading-[1.08] tracking-[-0.02em]'>
              {t('about.thesis.title.before', lang)}{' '}
              <span className='text-brand-crypto'>{t('about.thesis.title.accent', lang)}</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.15} inView>
            <p className='text-lg md:text-xl text-[var(--text-secondary)] leading-[1.75] text-center'>
              {t('about.thesis', lang)}
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Architecture */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-5xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-[var(--text-primary)] text-center mb-4 leading-[1.08] tracking-[-0.02em]'>
            {t('about.arch.title', lang)}
          </h2>
          <p className='text-lg text-[var(--text-secondary)] text-center mb-12 leading-[1.7]'>
            {t('about.arch.subtitle', lang)}
          </p>

          <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7'>
            {[
              {
                icon: (
                  <Image
                    src='/images/logos/whatsapp.svg'
                    alt='WhatsApp logo'
                    width={28}
                    height={28}
                  />
                ),
                bg: 'bg-brand-crypto-light',
                titleKey: 'about.arch1.title',
                descKey: 'about.arch1.desc',
              },
              {
                icon: (
                  <Image
                    src='/images/logos/coinbase.svg'
                    alt='Coinbase logo'
                    width={28}
                    height={28}
                  />
                ),
                bg: 'bg-brand-primary-light',
                titleKey: 'about.arch2.title',
                descKey: 'about.arch2.desc',
              },
              {
                icon: <Bot className='w-6 h-6 text-brand-crypto' />,
                bg: 'bg-brand-crypto-light',
                titleKey: 'about.arch3.title',
                descKey: 'about.arch3.desc',
              },
              {
                icon: (
                  <Image
                    src='/images/logos/circle.png'
                    alt='Circle USDC logo'
                    width={28}
                    height={28}
                  />
                ),
                bg: 'bg-brand-primary-light',
                titleKey: 'about.arch4.title',
                descKey: 'about.arch4.desc',
              },
              {
                icon: (
                  <Image
                    src='/images/logos/arbitrum.svg'
                    alt='Arbitrum logo'
                    width={28}
                    height={28}
                  />
                ),
                bg: 'bg-brand-primary-light',
                titleKey: 'about.arch5.title',
                descKey: 'about.arch5.desc',
              },
              {
                icon: <Zap className='w-6 h-6 text-brand-crypto' />,
                bg: 'bg-brand-crypto-light',
                titleKey: 'about.arch6.title',
                descKey: 'about.arch6.desc',
              },
            ].map((card) => (
              <div
                key={card.titleKey}
                className='group panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 h-full'
              >
                <div
                  className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center mb-5`}
                >
                  {card.icon}
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2.5'>
                  {t(card.titleKey, lang)}
                </h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t(card.descKey, lang)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-3xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-[var(--text-primary)] text-center mb-4 leading-[1.08] tracking-[-0.02em]'>
            {t('about.trust.title.before', lang)}{' '}
            <span className='text-brand-crypto'>{t('about.trust.title.accent', lang)}</span>
          </h2>
          <p className='text-lg text-[var(--text-secondary)] text-center mb-12 leading-[1.7]'>
            {t('about.trust.desc', lang)}
          </p>

          <div className='space-y-8'>
            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Lock className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-1'>{t('about.pillar1.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.pillar1.desc', lang)}
                </p>
              </div>
            </div>

            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Shield className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-1'>{t('about.pillar2.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.pillar2.desc', lang)}
                </p>
              </div>
            </div>

            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Eye className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-1'>{t('about.pillar3.title', lang)}</h3>
                <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                  {t('about.pillar3.desc', lang)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Traction */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-5xl mx-auto'>
          <BlurFade delay={0.1} inView>
            <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-[var(--text-primary)] text-center mb-12 leading-[1.08] tracking-[-0.02em]'>
              {t('about.traction.title', lang)}
            </h2>
          </BlurFade>

          <div className='grid md:grid-cols-3 gap-6'>
            <div className='panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <Trophy className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>
                {t('about.traction1.title', lang)}
              </h3>
              <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                {t('about.traction1.desc', lang)}
              </p>
              <a
                href='https://ethglobal.com/showcase/sippy-2smms'
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 mt-3 py-2 text-sm text-brand-crypto font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-crypto focus-visible:ring-offset-2 rounded'
              >
                {t('about.traction1.link', lang)}
                <ArrowUpRight className='w-3.5 h-3.5' />
                <span className='sr-only'>(opens in new tab)</span>
              </a>
            </div>

            <div className='panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <CheckCircle2 className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>
                {t('about.traction2.title', lang)}
              </h3>
              <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                {t('about.traction2.desc', lang)}
              </p>
            </div>

            <div className='panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <Globe className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-[var(--text-primary)] mb-2'>
                {t('about.traction3.title', lang)}
              </h3>
              <p className='text-[15px] text-[var(--text-secondary)] leading-[1.75]'>
                {t('about.traction3.desc', lang)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-6xl mx-auto'>
          <div className='relative overflow-hidden rounded-[32px] px-8 py-14 md:px-16 md:py-20 bg-brand-primary'>
            <div className='relative z-10 text-center max-w-3xl mx-auto'>
              <h2 className='font-display text-3xl md:text-[2.75rem] font-bold uppercase text-white leading-[1.08] tracking-[-0.02em] mb-4'>
                {t('about.cta.title', lang)}
              </h2>
              <p className='text-lg md:text-xl text-white/80 leading-[1.7]'>
                {t('about.cta.sub1', lang)}
              </p>
              <p className='text-lg md:text-xl text-white/80 leading-[1.7] mt-2 mb-10'>
                {t('about.cta.sub2', lang)}
              </p>
              <div className='flex flex-wrap gap-3.5 justify-center'>
                <a
                  href='mailto:hello@sippy.lat?subject=Partnership%20Inquiry'
                  className='px-7 py-3.5 bg-white text-brand-primary rounded-xl font-semibold hover:bg-white/90 active:scale-[0.98] transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary'
                >
                  {t('about.cta.contact', lang)}
                </a>
                <a
                  href='https://ethglobal.com/showcase/sippy-2smms'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='panel-frame-light px-7 py-3.5 text-white rounded-xl font-semibold hover:bg-white/5 active:scale-[0.98] transition-smooth flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary'
                >
                  {t('about.cta.showcase', lang)}
                  <ArrowUpRight className='w-4 h-4' />
                  <span className='sr-only'>(opens in new tab)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-[var(--border-strong)] bg-[var(--bg-primary)]'>
        <div className='max-w-7xl mx-auto px-6 py-10'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-6'>
            <div className='flex items-center gap-2.5'>
              <Image
                src='/images/logos/sippy-s-mark-cheetah.svg'
                alt='Sippy'
                width={20}
                height={20}
                className='dark:hidden'
              />
              <Image
                src='/images/logos/sippy-s-mark-white.svg'
                alt='Sippy'
                width={20}
                height={20}
                className='hidden dark:block'
              />
              <span className='text-[13px] text-[var(--text-secondary)]'>Sippy</span>
            </div>
            <nav aria-label='Footer navigation' className='flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--text-secondary)]'>
              <Link
                href='/'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                {t('about.footer.home', lang)}
              </Link>
              <Link
                href='/privacy'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                {t('about.footer.privacy', lang)}
              </Link>
              <Link
                href='/terms'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                {t('about.footer.terms', lang)}
              </Link>
              <a
                href='mailto:hello@sippy.lat'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                {t('about.footer.contact', lang)}
              </a>
            </nav>
          </div>
          <div className='flex flex-col items-center gap-4 mt-8 pt-6 border-t border-brand-primary/10'>
            <p className='spec-label spec-label-muted'>{t('about.footer.built', lang)}</p>
            <LanguageSwitcher current={lang} />
          </div>
        </div>
      </footer>
    </main>
  );
}
