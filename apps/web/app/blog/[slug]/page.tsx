/**
 * Blog post page — statically generated from content/blog/<slug>.md.
 */
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ScrollNav from '@/components/ui/scroll-nav'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import Markdown from '@/components/blog/Markdown'
import { getRequestLang } from '@/lib/i18n-server'
import { t } from '@/lib/i18n'
import {
  POSTS,
  getPostMeta,
  getPostBody,
  readingTimeMinutes,
  formatPostDate,
  pick,
} from '@/lib/blog'

const SIPPY_NUMBER = process.env.NEXT_PUBLIC_SIPPY_WHATSAPP_NUMBER || '+1 (472) 226-1449'

type Params = { slug: string }

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const meta = getPostMeta(slug)
  if (!meta) return {}
  const lang = await getRequestLang()
  const title = pick(meta.title, lang)
  const description = pick(meta.description, lang)
  return {
    title,
    description,
    alternates: { canonical: `https://sippy.lat/blog/${meta.slug}` },
    openGraph: {
      title,
      description,
      url: `https://sippy.lat/blog/${meta.slug}`,
      type: 'article',
      publishedTime: meta.date,
      authors: [meta.author],
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const meta = getPostMeta(slug)
  if (!meta) notFound()

  const lang = await getRequestLang()
  const body = await getPostBody(slug, lang)
  const minutes = readingTimeMinutes(body)
  const title = pick(meta.title, lang)
  const waHref = `https://wa.me/${SIPPY_NUMBER.replace(/\D/g, '')}?text=${encodeURIComponent('Hey Sippy!')}`

  return (
    <main
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]"
      id="main-content"
    >
      <ScrollNav>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center gap-3">
          <Link
            href="/"
            className="pointer-events-auto flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
          >
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy — go to homepage"
              width={120}
              height={34}
              priority
              className="w-[104px] sm:w-[120px] h-auto transition-smooth hover:scale-105"
            />
          </Link>
          <div className="pointer-events-auto flex items-center gap-3 sm:gap-4">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 font-mono text-xs tracking-[0.15em] uppercase text-[var(--text-secondary)] hover:text-brand-primary transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">All posts</span>
            </Link>
            <LanguageSwitcher current={lang} />
          </div>
        </div>
      </ScrollNav>

      <article className="px-6 pt-24 pb-14 sm:pt-28 sm:pb-20">
        {/* Header */}
        <header className="max-w-3xl mx-auto mb-10">
          <div className="flex items-center gap-3 flex-wrap font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-5">
            {meta.tags.map((tag) => (
              <span
                key={tag}
                className="border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-secondary)]"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-5xl leading-[1.05] tracking-[-0.02em] text-[var(--text-primary)] mb-6">
            {title}
          </h1>
          <div className="flex items-center gap-3 flex-wrap font-mono text-xs uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            <span>{meta.author}</span>
            <span className="text-brand-primary/50">/</span>
            <time dateTime={meta.date}>{formatPostDate(meta.date, lang)}</time>
            <span className="text-brand-primary/50">/</span>
            <span>{minutes} min read</span>
          </div>
        </header>

        <div className="max-w-3xl mx-auto h-px bg-[var(--border-strong)] mb-10" />

        {/* Body */}
        <div className="max-w-2xl mx-auto">
          <Markdown content={body} />
        </div>

        {/* CTA */}
        <div className="max-w-2xl mx-auto mt-16">
          <div className="panel-frame rounded-2xl p-8 text-center">
            <h2 className="font-display font-bold uppercase text-2xl sm:text-3xl text-[var(--text-primary)] mb-3">
              Try Sippy
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              Send and receive digital dollars on WhatsApp. No app, no seed phrase, no fees.
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-brand-primary text-white px-7 py-3.5 font-bold text-lg hover:bg-brand-primary-hover transition-all focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
            >
              {t('landing.hero.openWhatsapp', lang)}
            </a>
          </div>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t border-[var(--border-strong)] bg-[var(--bg-primary)]">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/images/logos/sippy-s-mark-cheetah.svg"
              alt="Sippy"
              width={20}
              height={20}
            />
            <span className="text-[13px] text-[var(--text-secondary)]">Sippy</span>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-[var(--text-secondary)]">
            <Link
              href="/blog"
              className="py-2 hover:text-brand-primary transition-smooth font-medium"
            >
              All posts
            </Link>
            <Link
              href="/about"
              className="py-2 hover:text-brand-primary transition-smooth font-medium"
            >
              About
            </Link>
            <Link
              href="/stats"
              className="py-2 hover:text-brand-primary transition-smooth font-medium"
            >
              Stats
            </Link>
          </nav>
          <LanguageSwitcher current={lang} />
        </div>
      </footer>
    </main>
  )
}
