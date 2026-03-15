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

export default function AboutPage() {
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
        </div>
      </ScrollNav>

      {/* Hero */}
      <section className='relative overflow-hidden py-12 sm:py-24'>
        <div className='relative z-10 max-w-[75vw] sm:max-w-3xl mx-auto text-center'>
          <div className='flex flex-wrap gap-3 items-center justify-center mb-8'>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-crypto-light border border-brand-crypto/20 rounded-full text-sm text-brand-dark animate-fade-in-up'>
              <CheckCircle2 className='w-4 h-4 text-brand-crypto' />
              <span className='font-medium'>Live on Arbitrum One</span>
            </div>
            <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-crypto-light border border-brand-crypto/20 rounded-full text-sm text-brand-dark animate-fade-in-up animation-delay-100'>
              <Zap className='w-4 h-4 text-brand-crypto' />
              <span className='font-medium'>Launching Q2 2026</span>
            </div>
          </div>

          <h1 className='font-display text-4xl md:text-5xl lg:text-[3.5rem] font-bold uppercase text-brand-dark leading-[1.08] tracking-[-0.025em] mb-6 animate-fade-in-up animation-delay-100'>
            The dollar wallet
            <br />
            <span className='text-brand-crypto'>for Latin America</span>
          </h1>

          <p className='text-lg md:text-xl text-gray-500 leading-[1.75] max-w-2xl mx-auto animate-fade-in-up animation-delay-200'>
            Sippy turns WhatsApp into a USDC wallet on Arbitrum One so you can send, receive, and hold dollars through messages without downloading an app, managing seed phrases, or learning anything about crypto.
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-4xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-brand-dark text-center mb-16 leading-[1.08] tracking-[-0.02em]'>
            How it <span className='text-brand-crypto'>works</span>
          </h2>

          <div className='relative'>
            <div className='hidden md:block absolute top-7 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-brand-primary/15' />

            <div className='grid md:grid-cols-3 gap-12 md:gap-8'>
              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  1
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>Create wallet</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  SMS verification. 30 seconds. You get your own smart wallet.
                </p>
              </div>

              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  2
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>Fund wallet</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  Buy USDC with local currency. Funds land directly in your wallet.
                </p>
              </div>

              <div className='text-center relative'>
                <div className='mx-auto mb-5 w-14 h-14 rounded-full bg-brand-crypto text-white flex items-center justify-center text-xl font-bold relative z-10'>
                  3
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>Send money</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  Type &ldquo;send $20 to +573001234567&rdquo; on WhatsApp. Arrives in seconds.
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
            <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-brand-dark text-center mb-6 leading-[1.08] tracking-[-0.02em]'>
              Why this <span className='text-brand-crypto'>matters</span>
            </h2>
          </BlurFade>
          <BlurFade delay={0.15} inView>
            <p className='text-lg md:text-xl text-gray-500 leading-[1.75] text-center'>
              WhatsApp has 90%+ penetration across Latin America. Hundreds of millions of people open it before breakfast, and most of them want dollar stability because local currencies keep losing value. But nobody is downloading a new app to get it. Sippy puts a dollar wallet inside the app they already use, powered by an AI agent that speaks their language.
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Architecture */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-5xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-brand-dark text-center mb-4 leading-[1.08] tracking-[-0.02em]'>
            Architecture
          </h2>
          <p className='text-lg text-gray-500 text-center mb-12 leading-[1.7]'>
            WhatsApp message in, on-chain transaction out
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
                title: 'WhatsApp Business API',
                desc: 'User interface via Meta Cloud API',
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
                title: 'Coinbase CDP Wallets',
                desc: 'Non-custodial embedded smart accounts',
              },
              {
                icon: <Bot className='w-6 h-6 text-brand-crypto' />,
                bg: 'bg-brand-crypto-light',
                title: 'AI Agent',
                desc: 'AI-powered payments in Spanish, English, and Portuguese',
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
                title: 'USDC on Arbitrum One',
                desc: 'Stable, regulated, deep liquidity',
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
                title: 'Arbitrum One',
                desc: 'Low-cost settlement, ~$0.01 per transaction',
              },
              {
                icon: <Zap className='w-6 h-6 text-brand-crypto' />,
                bg: 'bg-brand-crypto-light',
                title: 'GasRefuel.sol',
                desc: 'Gasless transactions for users',
              },
            ].map((card) => (
              <div
                key={card.title}
                className='group panel-frame rounded-2xl bg-white p-8 h-full'
              >
                <div
                  className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center mb-5`}
                >
                  {card.icon}
                </div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2.5'>
                  {card.title}
                </h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security */}
      <section className='relative py-12 sm:py-24'>
        <div className='max-w-[75vw] sm:max-w-3xl mx-auto'>
          <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-brand-dark text-center mb-4 leading-[1.08] tracking-[-0.02em]'>
            Trust & <span className='text-brand-crypto'>Security</span>
          </h2>
          <p className='text-lg text-gray-500 text-center mb-12 leading-[1.7]'>
            Users own their wallets. Sippy operates through spend permissions that users set and can revoke at any time.
          </p>

          <div className='space-y-8'>
            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Lock className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-1'>Non-custodial</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  Coinbase CDP Embedded Wallets. Users control their own smart accounts and can export their private keys.
                </p>
              </div>
            </div>

            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Shield className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-1'>User-controlled limits</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  Daily spend limits enforced on-chain via SpendPermissionManager. Users set and revoke these anytime.
                </p>
              </div>
            </div>

            <div className='flex items-start gap-5'>
              <div className='w-11 h-11 bg-brand-crypto-light rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Eye className='w-5 h-5 text-brand-crypto' />
              </div>
              <div>
                <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-1'>Fully transparent</h3>
                <p className='text-[15px] text-gray-500 leading-[1.75]'>
                  Every transaction is verifiable on Arbiscan. Amount, recipient, timestamp, all on-chain.
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
            <h2 className='font-display text-4xl md:text-[2.8rem] font-bold uppercase text-brand-dark text-center mb-12 leading-[1.08] tracking-[-0.02em]'>
              Traction
            </h2>
          </BlurFade>

          <div className='grid md:grid-cols-3 gap-6'>
            <div className='panel-frame rounded-2xl bg-white p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <Trophy className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>
                ETHOnline 2025 Finalist
              </h3>
              <p className='text-[15px] text-gray-500 leading-[1.75]'>
                Selected from hundreds of submissions at ETHGlobal.
              </p>
              <a
                href='https://ethglobal.com/showcase/sippy-2smms'
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 mt-3 py-2 text-sm text-brand-crypto font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-crypto focus-visible:ring-offset-2 rounded'
              >
                View showcase
                <ArrowUpRight className='w-3.5 h-3.5' />
                <span className='sr-only'>(opens in new tab)</span>
              </a>
            </div>

            <div className='panel-frame rounded-2xl bg-white p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <CheckCircle2 className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>
                Arbitrum Grants Program
              </h3>
              <p className='text-[15px] text-gray-500 leading-[1.75]'>
                Funded through Arbitrum New Protocols and Ideas 3.0 via Questbook.
              </p>
            </div>

            <div className='panel-frame rounded-2xl bg-white p-8 text-center h-full'>
              <div className='mx-auto mb-4 w-12 h-12 bg-brand-crypto-light rounded-xl flex items-center justify-center'>
                <Globe className='w-6 h-6 text-brand-crypto' />
              </div>
              <h3 className='font-display text-lg font-bold uppercase text-brand-dark mb-2'>
                Live on mainnet
              </h3>
              <p className='text-[15px] text-gray-500 leading-[1.75]'>
                Smart contracts deployed and operational on Arbitrum One. End-to-end payment flow validated.
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
                Money as fast as your&nbsp;messages.
              </h2>
              <p className='text-lg md:text-xl text-white/80 leading-[1.7]'>
                Launching Q2 2026 in Colombia.
              </p>
              <p className='text-lg md:text-xl text-white/80 leading-[1.7] mt-2 mb-10'>
                Built to scale across Latin America.
              </p>
              <div className='flex flex-wrap gap-3.5 justify-center'>
                <a
                  href='mailto:hello@sippy.lat?subject=Partnership%20Inquiry'
                  className='px-7 py-3.5 bg-white text-brand-primary rounded-xl font-semibold hover:bg-white/90 active:scale-[0.98] transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary'
                >
                  Get in touch
                </a>
                <a
                  href='https://ethglobal.com/showcase/sippy-2smms'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='panel-frame-light px-7 py-3.5 text-white rounded-xl font-semibold hover:bg-white/5 active:scale-[0.98] transition-smooth flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary'
                >
                  ETHGlobal Showcase
                  <ArrowUpRight className='w-4 h-4' />
                  <span className='sr-only'>(opens in new tab)</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-brand-dark/20 bg-white'>
        <div className='max-w-7xl mx-auto px-6 py-10'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-6'>
            <div className='flex items-center gap-2.5'>
              <Image
                src='/images/logos/sippy-s-mark-cheetah.svg'
                alt='Sippy'
                width={20}
                height={20}
              />
              <span className='text-[13px] text-brand-dark/60'>Sippy</span>
            </div>
            <nav aria-label='Footer navigation' className='flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-brand-dark/60'>
              <Link
                href='/'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                Home
              </Link>
              <Link
                href='/privacy'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                Privacy Policy
              </Link>
              <Link
                href='/terms'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                Terms of Service
              </Link>
              <a
                href='mailto:hello@sippy.lat'
                className='py-2 hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded'
              >
                Contact
              </a>
            </nav>
          </div>
          <div className='text-center mt-8 pt-6 border-t border-brand-primary/10'>
            <p className='spec-label spec-label-muted'>Built on Arbitrum One</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
