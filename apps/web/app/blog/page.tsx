/**
 * Blog index — list of Sippy posts.
 * Build-in-public notes from the team. Brand: equipment / spec-sheet aesthetic.
 */
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import ScrollNav from '@/components/ui/scroll-nav'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { getRequestLang } from '@/lib/i18n-server'
import { getAllPosts, getPostBody, readingTimeMinutes, formatPostDate, pick } from '@/lib/blog'

export const metadata = {
  title: 'Blog — Notes from the Sippy lab',
  description:
    'Build-in-public notes from Sippy: product lessons, community field reports, and what we’re learning bringing dollars to WhatsApp across Latin America.',
  alternates: { canonical: 'https://sippy.lat/blog' },
  openGraph: {
    title: 'Blog — Notes from the Sippy lab',
    description: 'Product lessons and community field reports from Sippy.',
    url: 'https://sippy.lat/blog',
    type: 'website',
  },
}

export default async function BlogIndexPage() {
  const lang = await getRequestLang()
  const posts = getAllPosts()
  const withMeta = await Promise.all(
    posts.map(async (p) => ({
      ...p,
      title: pick(p.title, lang),
      description: pick(p.description, lang),
      minutes: readingTimeMinutes(await getPostBody(p.slug, lang)),
    }))
  )

  return (
    <main
      className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]"
      id="main-content"
    >
      <ScrollNav>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
          >
            <Image
              src="/images/logos/sippy-wordmark-cheetah.svg"
              alt="Sippy — go to homepage"
              width={120}
              height={34}
              priority
              className="transition-smooth hover:scale-105"
            />
          </Link>
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-[var(--text-muted)]">
            /blog
          </span>
        </div>
      </ScrollNav>

      {/* Header */}
      <section className="relative py-16 sm:py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <span className="spec-label mb-4 block">Notes from the lab</span>
          <h1 className="font-display font-bold uppercase text-5xl sm:text-7xl tracking-[-0.03em] text-[var(--text-primary)] mb-5">
            Blog
          </h1>
          <p className="text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
            Building a dollar wallet for WhatsApp, out loud. Product lessons, community field
            reports, and the small details that make money feel as easy as a message.
          </p>
        </div>
      </section>

      {/* Post list */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto space-y-6">
          {withMeta.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block panel-frame rounded-2xl bg-[var(--bg-primary)] p-6 sm:p-8 transition-all hover:border-brand-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]"
            >
              <div className="flex items-center gap-3 flex-wrap font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--text-muted)] mb-4">
                <time dateTime={post.date}>{formatPostDate(post.date, lang)}</time>
                <span className="text-brand-primary/50">/</span>
                <span>{post.minutes} min read</span>
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="border border-[var(--border-strong)] px-2 py-0.5 text-[var(--text-secondary)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-[var(--text-primary)] leading-tight mb-3 group-hover:text-brand-primary transition-colors">
                {post.title}
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed text-base sm:text-lg mb-4">
                {post.description}
              </p>
              <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.15em] text-brand-primary">
                Read
                <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

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
            <Link href="/" className="py-2 hover:text-brand-primary transition-smooth font-medium">
              Home
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
