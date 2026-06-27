import { describe, it, expect } from 'vitest'
import { attemptSponsoredOnboarding, type SponsoredOnboardingIO } from './sponsoredOnboarding'

function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

function makeIO(over: Partial<SponsoredOnboardingIO> = {}) {
  const calls = { prepare: 0, sign: 0, submit: 0, record: 0 }
  const io: SponsoredOnboardingIO = {
    ownerEoa: '0xowner',
    getCdpToken: async () => 'cdp-token',
    prepare: async () => {
      calls.prepare++
      return res(200, { opId: 'op1', userOpHash: '0xhash' })
    },
    signHash: async () => {
      calls.sign++
      return '0xsig'
    },
    submit: async () => {
      calls.submit++
      return res(200, { status: 'landed', transactionHash: '0xtx' })
    },
    recordPermission: async () => {
      calls.record++
      return res(200, { success: true })
    },
    ...over,
  }
  return { io, calls }
}

describe('attemptSponsoredOnboarding', () => {
  it('flag off (prepare 404) → legacy, never signs', async () => {
    const { io, calls } = makeIO({ prepare: async () => res(404, {}) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.sign).toBe(0)
  })

  it('happy: prepared → signed → submitted(landed) → recorded → done', async () => {
    const { io, calls } = makeIO()
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('done')
    expect(calls.sign).toBe(1)
    expect(calls.submit).toBe(1)
    expect(calls.record).toBe(1)
  })

  it('alreadyGranted → done (no sign/submit — backend already recorded the hash)', async () => {
    const { io, calls } = makeIO({ prepare: async () => res(200, { alreadyGranted: true }) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('done')
    expect(calls.sign).toBe(0)
    expect(calls.submit).toBe(0)
  })

  // In-flight guard: a prior sponsored op is already broadcasting → error, NEVER legacy
  // (legacy would duplicate the approve the in-flight op is landing).
  it('prepare { processing: true } → error, never legacy (no sign)', async () => {
    const { io, calls } = makeIO({ prepare: async () => res(200, { processing: true }) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
    expect(calls.sign).toBe(0)
    expect(calls.submit).toBe(0)
  })

  // Post-/submit ambiguity: a 409 ("already submitted / not awaiting") might mean the op
  // was broadcast → NEVER legacy. No re-prepare (a re-prepared 2nd op could double-deploy).
  it('submit 409 → error, never legacy (op may be in flight)', async () => {
    const { io, calls } = makeIO({ submit: async () => res(409, { status: 'conflict' }) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
    expect(calls.prepare).toBe(1) // single prepare — no unsafe re-prepare
  })

  it('submit 5xx/502 → error, never legacy', async () => {
    const { io } = makeIO({ submit: async () => res(502, {}) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
  })

  it('submit 200 but malformed/unknown status → error, never legacy', async () => {
    const { io } = makeIO({ submit: async () => res(200, { status: 'weird' }) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
  })

  // The ONLY legacy-safe submit outcome: an explicit fallback = backend durably
  // terminalized the op BEFORE broadcasting, so nothing is in flight.
  it('submit explicit { status: fallback } → legacy (durable pre-broadcast terminalize)', async () => {
    const { io } = makeIO({ submit: async () => res(200, { status: 'fallback' }) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
  })

  it('prepare fallback (sponsored:false) → legacy, never signs', async () => {
    const { io, calls } = makeIO({
      prepare: async () => res(200, { sponsored: false, fallback: true }),
    })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.sign).toBe(0)
  })

  it('sign rejected → legacy (nothing broadcast)', async () => {
    const { io, calls } = makeIO({
      signHash: async () => {
        throw new Error('user rejected')
      },
    })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.submit).toBe(0)
  })

  it('no ownerEoa → legacy (no prepare attempted)', async () => {
    const { io, calls } = makeIO({ ownerEoa: null })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.prepare).toBe(0)
  })

  it('no CDP token → legacy (no prepare attempted)', async () => {
    const { io, calls } = makeIO({ getCdpToken: async () => null })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.prepare).toBe(0)
  })

  // The no-double-grant invariant: once it LANDS, a recording miss is `error`, never
  // `legacy` (legacy would createSpendPermission on top of the landed approve).
  it('landed but recordPermission fails → error (NOT legacy)', async () => {
    const { io } = makeIO({ recordPermission: async () => res(500, {}) })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
  })

  // Pre-broadcast throws degrade to legacy (nothing landed → safe).
  it('prepare throws (network) → legacy', async () => {
    const { io, calls } = makeIO({
      prepare: async () => {
        throw new Error('network down')
      },
    })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('legacy')
    expect(calls.sign).toBe(0)
  })

  // INVERTED (was 'legacy'): a thrown submit might have reached the backend + broadcast
  // before the response was lost → never legacy.
  it('submit throws (response lost — may have broadcast) → error, never legacy', async () => {
    const { io } = makeIO({
      submit: async () => {
        throw new Error('network down')
      },
    })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
  })

  // Post-landed: a recordPermission THROW is still the no-double-grant error, not legacy.
  it('landed but recordPermission throws → error (NOT legacy)', async () => {
    const { io } = makeIO({
      recordPermission: async () => {
        throw new Error('network down')
      },
    })
    const out = await attemptSponsoredOnboarding(io)
    expect(out.kind).toBe('error')
  })
})
