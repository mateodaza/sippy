import * as Sentry from '@sentry/nextjs'
import { beforeBreadcrumb } from './lib/sentry-pii'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: 0,
  beforeBreadcrumb,
})
