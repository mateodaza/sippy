/**
 * SIPPY Landing Page
 * Send PYUSD via WhatsApp on Arbitrum
 */

import Image from 'next/image';
import {
  CheckCircle2,
  Send,
  MessageSquare,
  Zap,
  Shield,
  ArrowRight,
  Check,
  Key,
  Users,
  Clock,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className='min-h-screen'>
      {/* Navigation */}
      <nav className='sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/60'>
        <div className='max-w-7xl mx-auto px-6 py-4 flex justify-between items-center'>
          <div className='flex items-center gap-2 animate-fade-in-up'>
            <Image
              src='/images/logos/sippy_full_green.svg'
              alt='Sippy Logo'
              width={110}
              height={44}
              priority
              className='transition-smooth hover:scale-105'
            />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className='relative overflow-hidden min-h-[82vh] flex items-center'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute top-[-120px] right-[-160px] w-[560px] h-[560px] bg-[#bbf7d0]/28 blur-[150px]' />
          <div className='absolute bottom-[-180px] left-[-120px] w-[520px] h-[520px] bg-[#bfdbfe]/22 blur-[170px]' />
          <div className='absolute inset-x-0 top-[25%] h-72 bg-gradient-to-b from-white/55 via-white/0 to-transparent blur-[110px]' />
          <div className='absolute inset-x-0 bottom-[-260px] h-[500px] bg-gradient-to-b from-transparent via-[#f4fcf8]/85 via-[#eefaf4]/88 to-[#eefaf4]' />
          <div className='absolute inset-x-0 bottom-[120px] h-40 bg-gradient-to-b from-transparent via-[#eefaf4]/70 to-[#eefaf4]' />
        </div>

        <div className='relative z-10 w-full'>
          <div className='max-w-7xl mx-auto px-6 py-24 md:py-[136px] lg:py-[168px] grid lg:grid-cols-2 gap-x-20 gap-y-16 items-center'>
            <div className='space-y-8'>
              {/* Badge */}
              <div className='inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#dcfce7] border border-[#bbf7d0] rounded-full text-sm text-[#15803d] shadow-sm animate-fade-in-up'>
                <CheckCircle2 className='w-4 h-4' />
                <span className='font-medium'>Powered by WhatsApp</span>
              </div>

              {/* Heading */}
              <h1 className='text-5xl md:text-[3.5rem] lg:text-[3.8rem] font-black text-[#0f172a] leading-[1.08] tracking-[-0.025em] animate-fade-in-up animation-delay-100'>
                Send PYUSD
                <br />
                <span className='text-[#059669]'>via WhatsApp</span>
              </h1>

              {/* Description */}
              <p className='text-lg md:text-xl text-gray-600 leading-[1.75] max-w-xl animate-fade-in-up animation-delay-200'>
                Transfer PayPal USD stablecoin using just a phone number.
                <br />
                No wallet. No gas fees. No blockchain knowledge required.
              </p>

              {/* Buttons */}
              <div className='flex flex-wrap gap-3.5 pt-4 animate-fade-in-up animation-delay-300'>
                <a
                  href='https://wa.me/15556363691?text=start'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='px-7 py-3.5 bg-[#059669] text-white rounded-xl font-semibold hover:bg-[#047857] shadow-[0_18px_36px_rgba(5,150,105,0.22)] hover:shadow-[0_22px_44px_rgba(4,120,87,0.28)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 group'
                >
                  Message SIPPY
                  <ArrowRight className='w-5 h-5 group-hover:translate-x-0.5 transition-transform' />
                </a>
                <a
                  href='/fund'
                  className='px-7 py-3.5 bg-white border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all duration-200 shadow-[0_10px_30px_rgba(15,23,42,0.08)] hover:shadow-[0_16px_40px_rgba(15,23,42,0.12)]'
                >
                  Fund a Phone
                </a>
              </div>

              {/* Trust Badges */}
              <div className='flex flex-wrap gap-x-6 gap-y-4 text-sm text-gray-600 pt-3 animate-fade-in-up animation-delay-400'>
                <div className='flex items-center gap-2'>
                  <Shield className='w-4 h-4 text-[#059669]' />
                  <span>Coinbase CDP Wallets</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Zap className='w-4 h-4 text-[#059669]' />
                  <span>Gasless transfers</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Check className='w-4 h-4 text-[#059669]' />
                  <span>On Arbitrum</span>
                </div>
              </div>
            </div>

            {/* WhatsApp Chat Mockup */}
            <div className='lg:pl-8 animate-fade-in-up animation-delay-500'>
              <div className='relative max-w-md mx-auto'>
                <div className='absolute -inset-6 rounded-[40px] bg-gradient-to-br from-[#dcfce7]/40 via-white/0 to-[#dbeafe]/30 blur-[40px]' />
                <div className='relative bg-white/90 backdrop-blur-xl rounded-[32px] shadow-[0_28px_70px_rgba(15,23,42,0.16)] p-8 border border-white/50 hover:shadow-[0_36px_86px_rgba(15,23,42,0.22)] hover:border-white/70 transition-all duration-500'>
                  {/* Chat Header */}
                  <div className='flex items-center gap-3 mb-6 pb-5 border-b border-gray-100/50'>
                    <div className='w-11 h-11 bg-[#dcfce7] rounded-full flex items-center justify-center p-2'>
                      <Image
                        src='/images/logos/sippy-green.svg'
                        alt='Sippy'
                        width={28}
                        height={28}
                      />
                    </div>
                    <div>
                      <h3 className='font-semibold text-gray-900 text-[15px]'>
                        Sippy Pay
                      </h3>
                      <p className='text-[13px] text-gray-500'>Online</p>
                    </div>
                  </div>

                  {/* Chat Messages */}
                  <div className='space-y-4'>
                    <div className='flex justify-start'>
                      <div className='bg-[#f9fafb] rounded-2xl rounded-tl-md px-4 py-3 max-w-[280px] shadow-sm'>
                        <p className='text-gray-700 text-[14px] leading-relaxed'>
                          🎉 Welcome to SIPPY!
                          <br />
                          Your wallet is ready.
                        </p>
                      </div>
                    </div>

                    <div className='flex justify-end'>
                      <div className='bg-[#059669] text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-[0_2px_8px_rgba(5,150,105,0.3)]'>
                        <p className='text-[14px]'>send 5 to +573001234567</p>
                      </div>
                    </div>

                    <div className='flex justify-start'>
                      <div className='bg-gradient-to-br from-white to-gray-50/30 border border-gray-200/60 rounded-2xl p-5 space-y-3 shadow-[0_4px_16px_rgba(0,0,0,0.06)]'>
                        <div className='flex items-center gap-3'>
                          <div className='w-10 h-10 bg-gradient-to-br from-[#d1fae5] to-[#a7f3d0] rounded-full flex items-center justify-center shadow-sm'>
                            <Send className='w-4 h-4 text-[#059669]' />
                          </div>
                          <div>
                            <p className='font-semibold text-gray-900 text-[13px]'>
                              ✅ Sent successfully
                            </p>
                            <p className='text-[12px] text-gray-500'>
                              To: +57300...
                            </p>
                          </div>
                        </div>
                        <p className='text-[36px] font-black text-gray-900 leading-none'>
                          5 PYUSD
                        </p>
                        <div className='flex items-center gap-1.5 text-[#059669] bg-[#dcfce7]/80 px-3 py-1.5 rounded-lg w-fit'>
                          <Check className='w-3.5 h-3.5' />
                          <span className='text-[11px] font-semibold'>
                            Gas covered by SIPPY
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className='relative py-24 md:py-28 -mt-12 sm:-mt-16 lg:-mt-24'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute inset-x-0 top-[-60px] h-[360px] bg-gradient-to-b from-[#eefaf4] via-[#eefaf4]/88 via-[#f4fcf8]/70 to-transparent' />
          <div className='absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#eefaf4] via-[#eefaf4]/72 via-[#f2fbf7]/58 to-transparent' />
        </div>
        <div className='relative max-w-7xl mx-auto px-6'>
          <div className='text-center mb-16'>
            <h2 className='text-4xl md:text-[2.8rem] font-black text-[#0f172a] mb-4 animate-fade-in-up leading-[1.08] tracking-[-0.02em]'>
              Why <span className='text-[#059669]'>SIPPY</span>?
            </h2>
            <p className='text-lg md:text-xl text-gray-600 leading-[1.7] max-w-2xl mx-auto animate-fade-in-up animation-delay-100'>
              The simplest way to send stablecoins using just WhatsApp
            </p>
          </div>

          <div className='grid md:grid-cols-2 lg:grid-cols-3 gap-7'>
            {/* No Wallet Needed */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-100'>
              <div className='w-12 h-12 bg-[#d1fae5] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-emerald-200/50'>
                <MessageSquare className='w-6 h-6 text-[#059669]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                No Wallet App
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                Just send "start" via WhatsApp. Your wallet is created instantly
                using Coinbase CDP infrastructure.
              </p>
            </div>

            {/* No Gas Fees */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-200'>
              <div className='w-12 h-12 bg-[#dbeafe] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-sky-200/60'>
                <Zap className='w-6 h-6 text-[#2563eb]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                Zero Gas Fees
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                We cover all gas fees automatically. Send PYUSD without worrying
                about ETH for gas.
              </p>
            </div>

            {/* Phone as Identity */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-300'>
              <div className='w-12 h-12 bg-[#e9d5ff] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-violet-200/60'>
                <Users className='w-6 h-6 text-[#9333ea]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                Send to Phone Numbers
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                No wallet addresses. Just send PYUSD to any phone number. Simple
                as texting.
              </p>
            </div>

            {/* No Private Keys */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-400'>
              <div className='w-12 h-12 bg-[#fed7aa] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-orange-200/70'>
                <Key className='w-6 h-6 text-[#ea580c]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                No Private Keys
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                Secured by Coinbase MPC technology. Can't lose your keys. Can't
                get phished.
              </p>
            </div>

            {/* Instant Transfers */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-500'>
              <div className='w-12 h-12 bg-[#fce7f3] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-pink-200/70'>
                <Clock className='w-6 h-6 text-[#db2777]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                Instant on Arbitrum
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                Transactions confirm in seconds on Arbitrum. Fast, cheap, and
                reliable.
              </p>
            </div>

            {/* Secure */}
            <div className='group bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 animate-fade-in-up animation-delay-600'>
              <div className='w-12 h-12 bg-[#ccfbf1] rounded-xl flex items-center justify-center mb-5 shadow-inner shadow-teal-200/60'>
                <Shield className='w-6 h-6 text-[#0f766e]' />
              </div>
              <h3 className='text-lg font-bold text-gray-900 mb-2.5'>
                Daily Limits
              </h3>
              <p className='text-[15px] text-gray-600 leading-[1.75]'>
                Protected with $500 daily and $100 transaction limits. Secure by
                default.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className='relative py-24 md:py-32'>
        <div className='absolute inset-0 pointer-events-none'>
          <div className='absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-[#eefaf4] via-[#eefaf4]/70 to-transparent' />
        </div>
        <div className='relative max-w-6xl mx-auto px-6'>
          <div className='relative overflow-hidden rounded-[32px] px-8 py-14 md:px-16 md:py-20 shadow-[0_32px_80px_rgba(6,24,37,0.45)] border border-white/8 bg-gradient-to-br from-[#08172b] via-[#042e2e] to-[#013b27]'>
            <div className='absolute -top-20 right-10 h-56 w-56 rounded-full bg-[#00c285]/25 blur-3xl' />
            <div className='absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-[#0ea5e9]/15 blur-[140px]' />
            <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.18),_transparent_60%)] opacity-70' />

            <div className='relative z-10 text-center max-w-3xl mx-auto'>
              <h2 className='text-4xl md:text-[2.75rem] font-black text-white leading-[1.08] tracking-[-0.02em] mb-4'>
                Get Started in Seconds
              </h2>
              <p className='text-lg md:text-xl text-[#d0fae5] leading-[1.7]'>
                No app download. No lengthy setup. Just WhatsApp.
              </p>
            </div>

            <div className='relative z-10 mt-12 grid gap-10 md:grid-cols-3 md:gap-12'>
              {/* Step 1 */}
              <div className='text-center'>
                <div className='mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#00bc7d] to-[#05a76f] text-white shadow-[0_20px_35px_rgba(1,56,39,0.35)] text-xl font-black'>
                  1
                </div>
                <h3 className='text-lg font-semibold text-white mb-3'>
                  Message Sippy
                </h3>
                <p className='mx-auto max-w-xs text-sm md:text-base text-[#d0fae5] leading-[1.7]'>
                  Send "start" to our WhatsApp number to create your account.
                </p>
              </div>

              {/* Step 2 */}
              <div className='text-center'>
                <div className='mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#00bc7d] to-[#05a76f] text-white shadow-[0_20px_35px_rgba(1,56,39,0.35)] text-xl font-black'>
                  2
                </div>
                <h3 className='text-lg font-semibold text-white mb-3'>
                  Get Funded
                </h3>
                <p className='mx-auto max-w-xs text-sm md:text-base text-[#d0fae5] leading-[1.7]'>
                  Friends or family can send you PYUSD from any wallet. We
                  handle all the crypto stuff behind the scenes.
                </p>
              </div>

              {/* Step 3 */}
              <div className='text-center'>
                <div className='mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#00bc7d] to-[#05a76f] text-white shadow-[0_20px_35px_rgba(1,56,39,0.35)] text-xl font-black'>
                  3
                </div>
                <h3 className='text-lg font-semibold text-white mb-3'>
                  Start Paying
                </h3>
                <p className='mx-auto max-w-xs text-sm md:text-base text-[#d0fae5] leading-[1.7]'>
                  Send, receive, and manage PYUSD through simple WhatsApp
                  messages.
                </p>
              </div>
            </div>

            <div className='relative z-10 mt-16 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-8 md:p-10 max-w-3xl mx-auto text-left'>
              <h4 className='text-base font-semibold text-white mb-6 text-center uppercase tracking-[0.12em]'>
                Available Commands
              </h4>
              <div className='grid md:grid-cols-2 gap-3.5 text-[#cdeedd]'>
                <div className='flex items-start gap-2.5 rounded-lg border border-white/0 p-3 transition-all duration-200 hover:border-white/15 hover:bg-white/5'>
                  <code className='font-mono text-[13px] font-semibold text-[#34d399]'>
                    start
                  </code>
                  <span className='text-[13px] md:text-sm'>
                    Create your wallet
                  </span>
                </div>
                <div className='flex items-start gap-2.5 rounded-lg border border-white/0 p-3 transition-all duration-200 hover:border-white/15 hover:bg-white/5'>
                  <code className='font-mono text-[13px] font-semibold text-[#34d399]'>
                    balance
                  </code>
                  <span className='text-[13px] md:text-sm'>
                    Check PYUSD balance
                  </span>
                </div>
                <div className='flex items-start gap-2.5 rounded-lg border border-white/0 p-3 transition-all duration-200 hover:border-white/15 hover:bg-white/5'>
                  <code className='font-mono text-[13px] font-semibold text-[#34d399]'>
                    send X to +57...
                  </code>
                  <span className='text-[13px] md:text-sm'>Transfer PYUSD</span>
                </div>
                <div className='flex items-start gap-2.5 rounded-lg border border-white/0 p-3 transition-all duration-200 hover:border-white/15 hover:bg-white/5'>
                  <code className='font-mono text-[13px] font-semibold text-[#34d399]'>
                    help
                  </code>
                  <span className='text-[13px] md:text-sm'>
                    Show all commands
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Partners */}
      <section className='max-w-7xl mx-auto px-6 py-20 md:py-24'>
        <div className='text-center mb-16'>
          <h2 className='text-4xl md:text-[2.6rem] font-black text-[#0f172a] mb-4 leading-[1.08] tracking-[-0.02em]'>
            Built with
          </h2>
          <p className='text-lg md:text-xl text-gray-600 leading-[1.7] max-w-2xl mx-auto'>
            Infra partners powering gasless WhatsApp payments
          </p>
        </div>

        <div className='grid sm:grid-cols-2 lg:grid-cols-5 gap-7'>
          <div className='group w-full h-full bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 flex flex-col items-center text-center'>
            <div className='w-16 h-16 bg-[#eff6ff] rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-blue-200/50'>
              <Image
                src='/images/logos/arbitrum.svg'
                alt='Arbitrum'
                width={56}
                height={56}
                className='w-12 h-12 object-contain'
              />
            </div>
            <p className='text-base font-bold text-gray-900 mb-1'>Arbitrum</p>
            <p className='text-sm text-gray-500'>L2 Network</p>
          </div>

          <div className='group w-full h-full bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 flex flex-col items-center text-center'>
            <div className='w-16 h-16 bg-[#ede9fe] rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-violet-200/50'>
              <Image
                src='/images/logos/avail.svg'
                alt='Avail'
                width={56}
                height={56}
                className='w-12 h-12 object-contain'
              />
            </div>
            <p className='text-base font-bold text-gray-900 mb-1'>Avail</p>
            <p className='text-sm text-gray-500'>Nexus Settlement</p>
          </div>

          <div className='group w-full h-full bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 flex flex-col items-center text-center'>
            <div className='w-16 h-16 bg-[#e0f2fe] rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-sky-200/60'>
              <Image
                src='/images/logos/coinbase.svg'
                alt='Coinbase'
                width={56}
                height={56}
                className='w-12 h-12 object-contain'
              />
            </div>
            <p className='text-base font-bold text-gray-900 mb-1'>Coinbase</p>
            <p className='text-sm text-gray-500'>CDP Wallets</p>
          </div>

          <div className='group w-full h-full bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 flex flex-col items-center text-center'>
            <div className='w-16 h-16 bg-[#dbeafe] rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-blue-200/50'>
              <Image
                src='/images/logos/pyusd.svg'
                alt='PYUSD'
                width={56}
                height={56}
                className='w-12 h-12 object-contain'
              />
            </div>
            <p className='text-base font-bold text-gray-900 mb-1'>PYUSD</p>
            <p className='text-sm text-gray-500'>PayPal USD</p>
          </div>

          <div className='group w-full h-full bg-white rounded-2xl p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] border border-gray-100 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)] hover:border-gray-200 transition-all duration-300 flex flex-col items-center text-center'>
            <div className='w-16 h-16 bg-[#dcfce7] rounded-2xl flex items-center justify-center mb-5 shadow-inner shadow-emerald-200/60'>
              <Image
                src='/images/logos/whatsapp.svg'
                alt='WhatsApp'
                width={56}
                height={56}
                className='w-12 h-12 object-contain'
              />
            </div>
            <p className='text-base font-bold text-gray-900 mb-1'>WhatsApp</p>
            <p className='text-sm text-gray-500'>Messaging Interface</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-gray-200 bg-white'>
        <div className='max-w-7xl mx-auto px-6 py-10'>
          <div className='flex flex-col md:flex-row justify-between items-center gap-6'>
            <div className='flex items-center gap-2.5'>
              <Image
                src='/images/logos/sippy-green.svg'
                alt='Sippy'
                width={20}
                height={20}
              />
              <p className='text-[13px] text-gray-600'>SIPPY</p>
            </div>
            <div className='flex gap-6 text-[13px] text-gray-600'>
              <a
                href='https://github.com/mateodaza/sippy'
                target='_blank'
                rel='noopener noreferrer'
                className='hover:text-[#059669] transition-colors duration-200 font-medium'
              >
                GitHub
              </a>
              <a
                href='https://arbiscan.io/token/0x46850aD61C2B7d64d08c9C754F45254596696984'
                target='_blank'
                rel='noopener noreferrer'
                className='hover:text-[#059669] transition-colors duration-200 font-medium'
              >
                PYUSD Contract
              </a>
              <a
                href='https://docs.cdp.coinbase.com/server-wallets/v2/introduction/welcome'
                target='_blank'
                rel='noopener noreferrer'
                className='hover:text-[#059669] transition-colors duration-200 font-medium'
              >
                CDP Docs
              </a>
            </div>
          </div>
          <div className='text-center mt-8 pt-6 border-t border-gray-100'>
            <p className='text-[11px] text-gray-500'>
              Built for ETHGlobal ETHOnline 2025 • Powered by Coinbase CDP,
              PYUSD & Arbitrum
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
