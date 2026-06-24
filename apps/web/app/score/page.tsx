/**
 * "Your score" — the authenticated per-user reputation standing (Phase D / D1).
 *
 * Mirrors wallet/page.tsx auth exactly (useSessionGuard + CDPProviderDefault +
 * the shared re-auth form). Reads GET /api/season/score with the JWT bearer; the
 * backend resolves the wallet SERVER-SIDE from the token — this page never sends a
 * wallet/phone, so a user can only ever see their own standing.
 *
 * Reputation-only: tier + progress-to-next + 2-3 next actions + a plain-language
 * "what it reflects" breakdown. NO scoring formula, NO reward/redeem language.
 * Degradation-safe: the season off / no wallet / unscored all render the friendly
 * empty state, never an error or a zero.
 */

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SippyPhoneInput } from '@/components/ui/phone-input'
import { getStoredToken } from '@/lib/auth'
import { useSessionGuard } from '@/lib/useSessionGuard'
import { ChannelPicker, ResendButton } from '../../components/shared/ChannelPicker'
import { Language, getStoredLanguage, resolveLanguage, t } from '../../lib/i18n'
import { CDPProviderDefault } from '../providers/cdp-provider'
import {
  SCORE_COPY,
  SEASON_TIER_NAME,
  TIER_STANDING_LINE,
  ACTION_LINE,
  type ScoreResponse,
} from '@/lib/season'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ''
const CDP_PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID || ''

function ScoreContent() {
  const searchParams = useSearchParams()
  const phoneFromUrl = searchParams.get('phone') || ''

  const {
    isAuthenticated,
    isCheckingSession,
    reAuthStep,
    reAuthPhone,
    reAuthOtp,
    reAuthError,
    reAuthLoading,
    setReAuthPhone,
    setReAuthOtp,
    handleReAuthSendOtp,
    handleReAuthVerifyOtp,
    reAuthChannel,
    reAuthCanSwitchChannel,
    signOut,
  } = useSessionGuard()

  const isPhoneLocked = !!phoneFromUrl
  const isCdpConfigured = !!CDP_PROJECT_ID

  // Initialize re-auth phone from URL param (sign-in prefill only — never sent to
  // the score API, which resolves the wallet from the JWT).
  useEffect(() => {
    if (phoneFromUrl) setReAuthPhone(phoneFromUrl)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Language — resolve like the wallet page (stored → backend → EN fallback).
  const [lang, setLang] = useState<Language>('en')
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  useEffect(() => {
    const cached = getStoredLanguage()
    if (cached) setLang(cached)
    const token = getStoredToken()
    resolveLanguage(phoneFromUrl || null, token, BACKEND_URL)
      .then((resolved) => {
        if (resolved !== cached) setLang(resolved)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [data, setData] = useState<ScoreResponse | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)

  const fetchScore = useCallback(async () => {
    const token = getStoredToken()
    if (!token) return
    setIsLoadingData(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/season/score`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setData((await res.json()) as ScoreResponse)
      } else {
        // Any failure degrades to the friendly empty state, never an error screen.
        setData({ scored: false, seasonId: 's1' })
      }
    } catch {
      setData({ scored: false, seasonId: 's1' })
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) fetchScore()
  }, [isAuthenticated, fetchScore])

  const c = SCORE_COPY[lang]

  // ── Loading the session ────────────────────────────────────────────────────
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full panel-frame rounded-2xl bg-[var(--bg-primary)] p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">📊</div>
            <p className="text-[var(--text-secondary)]">{t('wallet.loading', lang)}</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Not signed in — the same re-auth form the wallet page uses ───────────────
  if (!isAuthenticated && !isCheckingSession) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
        <div className="max-w-md w-full panel-frame rounded-2xl bg-[var(--bg-primary)] p-8">
          <h1 className="font-display text-2xl font-bold uppercase mb-6 text-[var(--text-primary)]">
            {t('wallet.title', lang)}
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">{t('wallet.subtitle', lang)}</p>

          {!isCdpConfigured && (
            <div className="mb-4 p-3 bg-[var(--fill-warning-light)] border border-yellow-200 rounded-lg text-yellow-800 text-sm">
              <strong>{t('wallet.configRequired', lang)}</strong>{' '}
              {t('wallet.configInstruction', lang)}
            </div>
          )}

          {reAuthError && (
            <div className="mb-4 p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
              {reAuthError}
            </div>
          )}

          {reAuthStep === 'phone' && (
            <>
              <SippyPhoneInput
                value={reAuthPhone}
                onChange={setReAuthPhone}
                locked={isPhoneLocked}
              />
              {isPhoneLocked && (
                <p className="text-sm text-[var(--text-secondary)] mb-4 mt-2">
                  {t('wallet.phoneFromWhatsapp', lang)}
                </p>
              )}
              <div className="mt-4" />
              <ChannelPicker
                canSwitch={reAuthCanSwitchChannel}
                isLoading={reAuthLoading}
                disabled={!reAuthPhone || !isCdpConfigured}
                lang={lang}
                onSend={handleReAuthSendOtp}
              />
            </>
          )}

          {reAuthStep === 'otp' && (
            <>
              <p className="text-[var(--text-secondary)] mb-4">
                {reAuthChannel === 'whatsapp'
                  ? lang === 'es'
                    ? `Enviamos un codigo a tu WhatsApp (${reAuthPhone})`
                    : lang === 'pt'
                      ? `Enviamos um codigo para seu WhatsApp (${reAuthPhone})`
                      : `We sent a code to your WhatsApp (${reAuthPhone})`
                  : `${t('wallet.codeSentTo', lang)} ${reAuthPhone}`}
              </p>
              <input
                type="text"
                inputMode="numeric"
                value={reAuthOtp}
                onChange={(e) => setReAuthOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                className="w-full p-3 border rounded-lg mb-4 text-center text-2xl tracking-widest text-[var(--text-primary)]"
              />
              <button
                onClick={handleReAuthVerifyOtp}
                disabled={reAuthLoading || reAuthOtp.length !== 6}
                className="w-full bg-brand-primary text-white py-3 rounded-lg font-semibold hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reAuthLoading ? t('wallet.verifying', lang) : t('wallet.verify', lang)}
              </button>
              <ResendButton
                channel={reAuthChannel}
                isLoading={reAuthLoading}
                lang={lang}
                onResend={() => handleReAuthSendOtp(reAuthChannel)}
              />
              <button
                onClick={() => setReAuthOtp('')}
                className="w-full mt-2 text-[var(--text-secondary)] py-2"
              >
                {t('wallet.back', lang)}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Authenticated standing view ──────────────────────────────────────────────
  const scored = data?.scored === true ? data : null

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] p-4">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold uppercase text-[var(--text-primary)]">
            {c.title}
          </h1>
          <Link href="/wallet" className="font-mono text-xs text-[var(--text-secondary)] underline">
            {c.backToWallet}
          </Link>
        </div>

        {isLoadingData && !data ? (
          <div className="panel-frame rounded-2xl p-8 text-center">
            <div className="animate-pulse text-[var(--text-secondary)]">
              {t('wallet.loading', lang)}
            </div>
          </div>
        ) : !scored ? (
          // Empty state — season off / no wallet / unscored.
          <div className="panel-frame rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{c.emptyTitle}</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{c.emptyBody}</p>
            <Link
              href="/temporada"
              className="mt-6 inline-block font-mono text-sm text-[var(--brand-primary)] underline"
            >
              {c.viewBoard}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Tier + score */}
            <div className="panel-frame rounded-2xl p-6 text-center">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {c.levelLabel}
              </p>
              <p className="mt-1 font-display text-4xl font-bold uppercase text-[var(--brand-primary)]">
                {SEASON_TIER_NAME[scored.tier]}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {TIER_STANDING_LINE[lang][scored.tier]}
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {c.scoreLabel}
              </p>
              <p className="font-mono text-3xl font-bold tabular-nums text-[var(--text-primary)]">
                {scored.score.toLocaleString()}
              </p>
            </div>

            {/* Progress to next tier */}
            <ProgressSection data={scored} copy={c} />

            {/* What it reflects (plain language, not a verb/point table) */}
            <div className="panel-frame rounded-2xl p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {c.signalsTitle}
              </p>
              <dl className="mt-3 space-y-2">
                <Signal label={c.activeWeeks} value={scored.activeWeeks} />
                <Signal label={c.friendsPaid} value={scored.distinctCounterparties} />
              </dl>
            </div>

            {/* Next actions */}
            {scored.topActions.length > 0 && (
              <div className="panel-frame rounded-2xl p-6">
                <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  {c.actionsTitle}
                </p>
                <ul className="mt-3 space-y-2">
                  {scored.topActions.map((a) => (
                    <li
                      key={a}
                      className="flex items-start gap-2 text-sm text-[var(--text-primary)]"
                    >
                      <span className="text-[var(--brand-crypto)]">→</span>
                      <span>{ACTION_LINE[lang][a]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Anonymous board id + link */}
            <div className="panel-frame rounded-2xl p-6">
              <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
                {c.boardIdLabel}
              </p>
              <p className="mt-1 font-mono text-base text-[var(--text-primary)]">
                {scored.displayId}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{c.boardIdHint}</p>
              <Link
                href="/temporada"
                className="mt-4 inline-block font-mono text-sm text-[var(--brand-primary)] underline"
              >
                {c.viewBoard}
              </Link>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={signOut}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
              >
                {t('wallet.signOut', lang)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ProgressSection({
  data,
  copy,
}: {
  data: Extract<ScoreResponse, { scored: true }>
  copy: (typeof SCORE_COPY)[Language]
}) {
  const next = data.nextTier
  return (
    <div className="panel-frame rounded-2xl p-6">
      <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {copy.progressTitle}
      </p>
      {next === null ? (
        <p className="mt-2 text-sm text-[var(--text-primary)]">{copy.topTier}</p>
      ) : next.verificationRequired ? (
        // Power step — identity verification, never a points-only path.
        <p className="mt-2 text-sm text-[var(--text-primary)]">
          {copy.verifyToReach(SEASON_TIER_NAME[next.tier])}
        </p>
      ) : next.tier === 'activated' ? (
        <p className="mt-2 text-sm text-[var(--text-primary)]">
          {copy.firstSendToReach(SEASON_TIER_NAME[next.tier])}
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-[var(--text-secondary)]">
              {copy.progressTo(SEASON_TIER_NAME[next.tier])}
            </span>
            <span className="font-mono tabular-nums text-[var(--text-primary)]">
              {next.progressPct}%
            </span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-sm bg-[var(--border-default)]">
            <div
              className="h-full bg-brand-primary transition-all"
              style={{ width: `${Math.max(next.progressPct, 2)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            {copy.pctToward(next.progressPct, SEASON_TIER_NAME[next.tier])}
          </p>
        </>
      )}
    </div>
  )
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
      <dd className="font-mono text-base font-semibold tabular-nums text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  )
}

export default function ScorePage() {
  return (
    <CDPProviderDefault>
      <Suspense
        fallback={
          <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">Loading...</div>
          </div>
        }
      >
        <ScoreContent />
      </Suspense>
    </CDPProviderDefault>
  )
}
