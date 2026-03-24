'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center text-sm sm:text-base text-[var(--text-secondary)] hover:text-brand-primary transition-smooth font-medium"
    >
      <svg
        className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  )
}
