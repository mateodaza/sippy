'use client'

import { useEffect } from 'react'
import { PostHogProvider as PHProvider } from '@posthog/react'
import { initPostHog, posthog } from '../../lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
