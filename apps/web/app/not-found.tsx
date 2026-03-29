import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '404 — Page Not Found',
  description: 'The page you are looking for does not exist. Go back to Sippy.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-md w-full text-center">
        <p className="font-mono text-sm text-brand-primary tracking-[0.3em] uppercase mb-4">404</p>
        <h1 className="font-display font-bold text-3xl sm:text-5xl text-[var(--text-primary)] uppercase mb-4">
          Page Not Found
        </h1>
        <p className="text-[var(--text-secondary)] text-base sm:text-lg mb-8">
          This page doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="font-mono text-sm tracking-[0.15em] uppercase text-[var(--text-primary)] border border-[var(--border-strong)] px-6 py-3 rounded-lg hover:border-brand-primary hover:text-brand-primary transition-smooth"
          >
            Back to Home
          </Link>
          <Link
            href="/support"
            className="font-mono text-sm tracking-[0.15em] uppercase text-[var(--text-secondary)] hover:text-brand-primary transition-smooth"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  )
}
