/**
 * Terms of Service Page
 * For Meta WhatsApp Business API approval
 * Focused on Colombia
 */

import Image from 'next/image'
import Link from 'next/link'
import { FileText, Mail, ArrowLeft } from 'lucide-react'
import { getRequestLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import { LanguageSwitcher } from '@/components/ui/language-switcher'

export const metadata = {
  title: 'Terms of Service - Sippy',
  description:
    'Terms of Service for Sippy WhatsApp payment service. Read our terms and conditions for using the service.',
  alternates: {
    canonical: 'https://sippy.lat/terms',
  },
}

export default async function TermsOfServicePage() {
  const lang = await getRequestLang()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className="sticky top-0 z-50 bg-[var(--bg-nav-blur)] backdrop-blur-xl border-b border-brand-primary/10"
      >
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
          >
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy Logo"
              width={148}
              height={43}
              priority
              className="transition-smooth hover:scale-105"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-brand-primary transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('terms.back', lang)}
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="py-12 sm:py-24">
        <div className="max-w-[75vw] sm:max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary-light border border-brand-primary/20 rounded-full text-sm text-brand-primary mb-6">
            <FileText className="w-4 h-4" />
            <span className="font-medium">{t('terms.title', lang)}</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold uppercase text-[var(--text-primary)] mb-4">
            {t('terms.title', lang)}
          </h1>
          <p className="text-[var(--text-secondary)]">{t('terms.updated', lang)}</p>
        </div>
      </header>

      {/* Content */}
      <main id="main-content" className="pb-20">
        <div className="max-w-[75vw] sm:max-w-4xl mx-auto">
          <div className="panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 md:p-12">
            <div className="max-w-none text-[var(--text-secondary)] [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:uppercase [&_h2]:text-[var(--text-primary)] [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1 [&_a]:text-brand-primary [&_a]:hover:text-brand-primary-hover">
              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s1.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s1.p1', lang)}
                </p>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s1.p2', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s2.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s2.intro', lang)}
                </p>
                <div className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-brand-primary/10">
                  <p className="text-[var(--text-secondary)] font-medium">
                    {t('terms.s2.name', lang)}
                  </p>
                  <p className="text-[var(--text-secondary)]">{t('terms.s2.registration', lang)}</p>
                  <p className="text-[var(--text-secondary)] flex items-center gap-2 mt-3 pt-3 border-t border-brand-primary/10">
                    <Mail className="w-4 h-4" />
                    <a
                      href="mailto:hello@sippy.lat"
                      className="text-brand-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
                    >
                      hello@sippy.lat
                    </a>
                  </p>
                </div>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s3.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s3.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s3.item1', lang)}</li>
                  <li>{t('terms.s3.item2', lang)}</li>
                  <li>{t('terms.s3.item3', lang)}</li>
                  <li>{t('terms.s3.item4', lang)}</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s4.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s4.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s4.item1', lang)}</li>
                  <li>{t('terms.s4.item2', lang)}</li>
                  <li>{t('terms.s4.item3', lang)}</li>
                  <li>{t('terms.s4.item4', lang)}</li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s4.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s5.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s5.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s5.item1', lang)}</li>
                  <li>{t('terms.s5.item2', lang)}</li>
                  <li>{t('terms.s5.item3', lang)}</li>
                  <li>{t('terms.s5.item4', lang)}</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s6.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s6.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>
                    <strong>{t('terms.s6.item1', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s6.item2', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s6.item3', lang)}</strong>
                  </li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s6.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s7.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s7.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s7.item1', lang)}</li>
                  <li>{t('terms.s7.item2', lang)}</li>
                  <li>{t('terms.s7.item3', lang)}</li>
                  <li>{t('terms.s7.item4', lang)}</li>
                  <li>{t('terms.s7.item5', lang)}</li>
                  <li>{t('terms.s7.item6', lang)}</li>
                  <li>{t('terms.s7.item7', lang)}</li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s7.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s8.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s8.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>
                    <strong>{t('terms.s8.item1', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s8.item2', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s8.item3', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s8.item4', lang)}</strong>
                  </li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s9.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s9.body', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s10.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s10.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s10.item1', lang)}</li>
                  <li>{t('terms.s10.item2', lang)}</li>
                  <li>{t('terms.s10.item3', lang)}</li>
                  <li>{t('terms.s10.item4', lang)}</li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s10.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s11.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s11.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>
                    <strong>{t('terms.s11.item1', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s11.item2', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s11.item3', lang)}</strong>
                  </li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s11.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s12.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s12.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s12.item1', lang)}</li>
                  <li>{t('terms.s12.item2', lang)}</li>
                  <li>{t('terms.s12.item3', lang)}</li>
                  <li>{t('terms.s12.item4', lang)}</li>
                </ul>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s13.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s13.body', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s14.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s14.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>{t('terms.s14.item1', lang)}</li>
                  <li>{t('terms.s14.item2', lang)}</li>
                  <li>{t('terms.s14.item3', lang)}</li>
                  <li>{t('terms.s14.item4', lang)}</li>
                  <li>{t('terms.s14.item5', lang)}</li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  <strong>{t('terms.s14.suspension', lang)}</strong>
                </p>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  <strong>{t('terms.s14.termination', lang)}</strong>
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s15.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s15.intro', lang)}
                </p>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2 mb-4">
                  <li>
                    <strong>{t('terms.s15.item1', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s15.item2', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s15.item3', lang)}</strong>
                  </li>
                </ul>
                <h3 className="font-display text-lg font-bold uppercase text-[var(--text-primary)] mt-6 mb-3">
                  {t('terms.s15.refunds.title', lang)}
                </h3>
                <ul className="list-disc pl-6 text-[var(--text-secondary)] space-y-2">
                  <li>
                    <strong>{t('terms.s15.refunds.item1', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s15.refunds.item2', lang)}</strong>
                  </li>
                  <li>
                    <strong>{t('terms.s15.refunds.item3', lang)}</strong>
                  </li>
                </ul>
                <p className="text-[var(--text-secondary)] leading-relaxed mt-4">
                  {t('terms.s15.footer', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s16.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s16.body', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s17.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s17.body', lang)}
                </p>
              </section>

              <section className="mb-10">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s18.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {t('terms.s18.body', lang)}
                </p>
              </section>

              <section className="mb-6">
                <h2 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)] mb-4">
                  {t('terms.s19.title', lang)}
                </h2>
                <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                  {t('terms.s19.intro', lang)}
                </p>
                <div className="bg-brand-primary-light rounded-xl p-6 border border-brand-primary/20">
                  <p className="text-[var(--text-primary)] font-medium text-lg">
                    {t('terms.s19.name', lang)}
                  </p>
                  <p className="text-[var(--text-secondary)] font-medium">
                    {t('terms.s19.registration', lang)}
                  </p>
                  <p className="text-[var(--text-secondary)] flex items-center gap-2 mt-3 pt-3 border-t border-brand-primary/20">
                    <Mail className="w-4 h-4 text-brand-primary" />
                    <a
                      href="mailto:hello@sippy.lat"
                      className="text-brand-primary hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
                    >
                      hello@sippy.lat
                    </a>
                  </p>
                  <p className="text-[var(--text-secondary)] text-sm mt-3">
                    {t('terms.s19.response', lang)}
                  </p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-strong)] bg-[var(--bg-primary)]">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Image
                src="/images/logos/sippy-s-mark-cheetah.svg"
                alt="Sippy"
                width={20}
                height={20}
              />
              <p className="text-sm text-[var(--text-secondary)]">
                &copy; {new Date().getFullYear()} Sippy. All rights reserved.
              </p>
            </div>
            <LanguageSwitcher current={lang} />
            <nav
              aria-label="Footer navigation"
              className="flex gap-6 text-sm text-[var(--text-secondary)]"
            >
              <Link
                href="/"
                className="hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
              >
                {t('legal.home', lang)}
              </Link>
              <Link
                href="/privacy"
                className="hover:text-brand-primary transition-smooth font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
              >
                {t('legal.privacyPolicy', lang)}
              </Link>
              <Link href="/terms" className="text-brand-primary font-medium">
                {t('legal.termsOfService', lang)}
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
