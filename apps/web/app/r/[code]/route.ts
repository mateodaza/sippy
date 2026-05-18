/**
 * Referral share-link redirect.
 *
 * Background: bot replies that contained raw `wa.me/<sippy-number>?text=…`
 * URLs got suppressed by WhatsApp ("[link removed]") because the bot was
 * sending a deeplink back to its own number — WhatsApp's anti-spam guard
 * blocks self-targeting wa.me links. Bouncing through our own domain
 * sidesteps that filter (the user-visible URL is `sippy.lat/r/<code>`,
 * which WhatsApp renders normally), and gives us a stable share target
 * for non-WhatsApp channels too (SMS, Twitter, copy-paste).
 *
 * Flow: friend taps `https://sippy.lat/r/<code>` → this route responds
 * with a 302 to `wa.me/<sippy-number>?text=Hola Sippy! [REF-<code>]` →
 * WhatsApp opens prefilled → user sends → backend's referral
 * bracket-token dispatcher captures the attribution.
 *
 * Validation is deliberately permissive: any 6-char Crockford payload
 * passes through. An unknown code still produces a valid wa.me link;
 * the backend's `captureReferral` logs `unknown_code` and the user
 * gets a normal welcome. Better than failing here and showing an
 * error page — the click already happened, intent was clear.
 */

import { NextRequest, NextResponse } from 'next/server'

// Mirrors `SIPPY_NUMBER` in app/page.tsx so the canonical bot number
// lives in env. The fallback matches the value used everywhere else
// on the web app; do NOT diverge — that would split the Sippy chat
// across two contacts in users' phones.
const SIPPY_WA_NUMBER = process.env.NEXT_PUBLIC_SIPPY_WHATSAPP_NUMBER || '+14722261449'

// 6-char Crockford alphabet (no 0/1/I/L/O) — matches the referral code
// generator on the backend. Case-insensitive on input; the inbound
// bracket-token extractor on the backend normalizes to uppercase.
const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()

  // Malformed shape → send the visitor to the landing page rather than
  // serve a wa.me deeplink with a junk token. Soft-fail; no error page.
  if (!REFERRAL_CODE_PATTERN.test(normalized)) {
    return NextResponse.redirect(new URL('/', req.url), 302)
  }

  const digits = SIPPY_WA_NUMBER.replace(/\D/g, '')
  // The bracket token MUST match the parser pattern in
  // `extractReferralToken` (apps/backend/app/services/bracket_token.service.ts).
  // Square brackets around `REF-<CODE>`, no spaces inside. Drift here
  // = silent attribution loss.
  const text = `Hola Sippy! [REF-${normalized}]`
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`

  return NextResponse.redirect(waUrl, 302)
}
