'use client'

import { useState } from 'react'
import { createSupportTicket } from '@/lib/support'
import { t, type Language } from '@/lib/i18n'

interface SupportFormProps {
  userEmail?: string
  authToken?: string | null
  lang: Language
  /** When true, the email field shows the masked email and is not editable.
   *  The backend resolves the real verified email server-side. */
  emailReadOnly?: boolean
}

const CATEGORIES = ['general', 'payments', 'account', 'other'] as const

export function SupportForm({ userEmail, authToken, lang, emailReadOnly }: SupportFormProps) {
  const [email, setEmail] = useState(userEmail || '')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string>('general')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const emailValid = emailReadOnly || email.includes('@')
  const canSubmit =
    emailValid &&
    subject.trim().length > 0 &&
    description.trim().length >= 20 &&
    status !== 'submitting'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('submitting')
    setErrorMessage(null)

    try {
      const result = await createSupportTicket(
        {
          subject: subject.trim(),
          description: description.trim(),
          // For emailReadOnly, send a placeholder — backend uses verified email from DB
          email: emailReadOnly ? 'verified@placeholder' : email.trim().toLowerCase(),
          category,
        },
        authToken
      )
      setTicketNumber(result.ticketNumber)
      setStatus('success')
      setSubject('')
      setDescription('')
      setCategory('general')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('support.error', lang))
      setStatus('error')
    }
  }

  if (status === 'success' && ticketNumber) {
    return (
      <div className="p-4 bg-[var(--fill-success-light)] border border-green-200 rounded-lg">
        <p className="font-semibold text-green-800 mb-1">{t('support.success.title', lang)}</p>
        <p className="text-sm text-green-700">
          {t('support.success.message', lang).replace('{number}', ticketNumber)}
        </p>
        <button
          onClick={() => {
            setStatus('idle')
            setTicketNumber(null)
          }}
          className="mt-3 text-sm text-green-700 underline"
        >
          {t('support.newTicket', lang)}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {t('support.email', lang)}
        </label>
        {emailReadOnly && userEmail ? (
          <div className="w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--bg-secondary)] text-[var(--text-secondary)] text-sm">
            {userEmail}
            <span className="text-xs text-[var(--text-muted)] ml-2">
              ({t('support.emailVerified', lang)})
            </span>
          </div>
        ) : (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
            placeholder="you@example.com"
          />
        )}
      </div>

      {/* Subject */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {t('support.subject', lang)}
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={255}
          className="w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
          placeholder={t('support.subjectPlaceholder', lang)}
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {t('support.category', lang)}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {t(`support.category.${cat}`, lang)}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
          {t('support.description', lang)}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          maxLength={5000}
          className="w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] text-sm resize-none"
          placeholder={t('support.descriptionPlaceholder', lang)}
        />
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {description.length}/5000 · {t('support.minChars', lang)}
        </p>
      </div>

      {/* Error */}
      {status === 'error' && errorMessage && (
        <div className="p-3 bg-[var(--fill-danger-light)] border border-red-200 rounded-lg text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {status === 'submitting' ? t('support.submitting', lang) : t('support.submit', lang)}
      </button>
    </form>
  )
}
