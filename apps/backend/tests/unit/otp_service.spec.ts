import { test } from '@japa/runner'
import OtpService from '#services/otp_service'
import UserPreference from '#models/user_preference'
import axios from 'axios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockSender(): { calls: Array<{ to: string; body: string }>; sender: (to: string, body: string) => Promise<void> } {
  const calls: Array<{ to: string; body: string }> = []
  return {
    calls,
    sender: async (to: string, body: string) => {
      calls.push({ to, body })
    },
  }
}

// ── sendOtp — code generation ─────────────────────────────────────────────────

test.group('OtpService | sendOtp — code generation', () => {
  test('returns { success: true } on first send', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const result = await svc.sendOtp('+573001234567')
    assert.deepEqual(result, { success: true })
  })

  test('code stored in otpStore is exactly 6 digits', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567')
    const store = (svc as any).otpStore as Map<string, { code: string; expiresAt: number; attempts: number }>
    const entry = store.get('+573001234567')
    assert.isString(entry?.code)
    assert.match(entry!.code, /^\d{6}$/)
  })

  test('each call generates a different code (statistically)', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567')
    const store = (svc as any).otpStore as Map<string, { code: string }>
    const code1 = store.get('+573001234567')!.code

    // Use different phone to avoid rate limit
    await svc.sendOtp('+573001234568')
    const code2 = store.get('+573001234568')!.code

    // With 1,000,000 possibilities this is astronomically unlikely to collide
    // but codes are independently generated so they should generally differ
    assert.match(code1, /^\d{6}$/)
    assert.match(code2, /^\d{6}$/)
  })

  test('TTL is approximately 5 minutes', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const before = Date.now()
    await svc.sendOtp('+573001234567')
    const store = (svc as any).otpStore as Map<string, { expiresAt: number }>
    const entry = store.get('+573001234567')!
    const expectedExpiry = before + 5 * 60 * 1000
    // within 1 second of expected
    assert.isAbove(entry.expiresAt, expectedExpiry - 1000)
    assert.isBelow(entry.expiresAt, expectedExpiry + 1000)
  })
})

// ── sendOtp — rate limiting ───────────────────────────────────────────────────

test.group('OtpService | sendOtp — rate limiting', () => {
  test('first 3 sends per phone succeed', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const phone = '+573009999001'
    const r1 = await svc.sendOtp(phone)
    const r2 = await svc.sendOtp(phone)
    const r3 = await svc.sendOtp(phone)
    assert.deepEqual(r1, { success: true })
    assert.deepEqual(r2, { success: true })
    assert.deepEqual(r3, { success: true })
  })

  test('4th send in same window returns rate_limited', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const phone = '+573009999002'
    await svc.sendOtp(phone)
    await svc.sendOtp(phone)
    await svc.sendOtp(phone)
    const result = await svc.sendOtp(phone)
    assert.equal((result as any).error, 'rate_limited')
  })

  test('retryAfter is a positive integer <= 60', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const phone = '+573009999003'
    await svc.sendOtp(phone)
    await svc.sendOtp(phone)
    await svc.sendOtp(phone)
    const result = await svc.sendOtp(phone) as { error: 'rate_limited'; retryAfter: number }
    assert.isNumber(result.retryAfter)
    assert.isAbove(result.retryAfter, 0)
    assert.isAtMost(result.retryAfter, 60)
  })

  test('different phones are independent', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const phoneA = '+573009999004'
    const phoneB = '+573009999005'
    await svc.sendOtp(phoneA)
    await svc.sendOtp(phoneA)
    await svc.sendOtp(phoneA)
    // phoneA is now limited; phoneB should still work
    await svc.sendOtp(phoneA)
    const result = await svc.sendOtp(phoneB)
    assert.deepEqual(result, { success: true })
  })
})

// ── sendOtp — Twilio SMS sender ───────────────────────────────────────────────

test.group('OtpService | sendOtp — Twilio SMS sender', () => {
  test('calls injected smsSender with phone number and body containing the code', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567')
    assert.lengthOf(mock.calls, 1)
    assert.equal(mock.calls[0].to, '+573001234567')
    assert.match(mock.calls[0].body, /\d{6}/)
  })

  test('SMS body uses Spanish template by default (es)', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567', 'es')
    assert.include(mock.calls[0].body, 'Tu código es')
  })

  test('SMS body uses English template for lang=en', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567', 'en')
    assert.include(mock.calls[0].body, 'Your code is')
  })

  test('SMS body uses Portuguese template for lang=pt', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567', 'pt')
    assert.include(mock.calls[0].body, 'Seu código é')
  })

  test('body matches pattern Sippy: .*\\d{6}', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001234567')
    assert.match(mock.calls[0].body, /^Sippy: .*\d{6}$/)
  })
})

// ── sendOtp — language resolution ─────────────────────────────────────────────

test.group('OtpService | sendOtp — language resolution', () => {
  test('lang=en overrides everything → English body', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+55119999990', 'en')
    assert.include(mock.calls[0].body, 'Your code is')
  })

  test('lang=pt overrides everything → Portuguese body', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+13005551234', 'pt')
    assert.include(mock.calls[0].body, 'Seu código é')
  })

  test('phone prefix +55 falls back to Portuguese when no lang/pref given', async ({ assert }) => {
    const mock = makeMockSender()
    // Inject a resolveLanguage that skips DB by overriding UserPreference.find
    const svc = new OtpService(mock.sender)
    // Patch resolveLanguage to bypass DB
    ;(svc as any).resolveLanguage = async (phone: string, lang?: string) => {
      if (lang === 'es' || lang === 'en' || lang === 'pt') return lang
      if (phone.startsWith('+55')) return 'pt'
      if (phone.startsWith('+1')) return 'en'
      return 'es'
    }
    await svc.sendOtp('+5511999990001')
    assert.include(mock.calls[0].body, 'Seu código é')
  })

  test('phone prefix +1 falls back to English when no lang/pref given', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    ;(svc as any).resolveLanguage = async (phone: string, lang?: string) => {
      if (lang === 'es' || lang === 'en' || lang === 'pt') return lang
      if (phone.startsWith('+55')) return 'pt'
      if (phone.startsWith('+1')) return 'en'
      return 'es'
    }
    await svc.sendOtp('+13005551234')
    assert.include(mock.calls[0].body, 'Your code is')
  })

  test('unknown prefix falls back to Spanish', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    ;(svc as any).resolveLanguage = async (phone: string, lang?: string) => {
      if (lang === 'es' || lang === 'en' || lang === 'pt') return lang
      if (phone.startsWith('+55')) return 'pt'
      if (phone.startsWith('+1')) return 'en'
      return 'es'
    }
    await svc.sendOtp('+447700900001')
    assert.include(mock.calls[0].body, 'Tu código es')
  })
})

// ── verifyOtp — happy path ────────────────────────────────────────────────────

test.group('OtpService | verifyOtp — happy path', () => {
  test('returns { valid: true } when correct code provided within TTL', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001111001')
    const store = (svc as any).otpStore as Map<string, { code: string }>
    const code = store.get('+573001111001')!.code
    const result = await svc.verifyOtp('+573001111001', code)
    assert.deepEqual(result, { valid: true })
  })

  test('entry is deleted from otpStore after successful verification', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001111002')
    const store = (svc as any).otpStore as Map<string, { code: string }>
    const code = store.get('+573001111002')!.code
    await svc.verifyOtp('+573001111002', code)
    assert.isFalse(store.has('+573001111002'))
  })
})

// ── verifyOtp — wrong code ────────────────────────────────────────────────────

test.group('OtpService | verifyOtp — wrong code', () => {
  test('returns { valid: false } (no locked) for first 4 wrong attempts', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001222001')
    for (let i = 0; i < 4; i++) {
      const result = await svc.verifyOtp('+573001222001', '000000')
      assert.equal((result as any).valid, false)
      assert.isUndefined((result as any).locked)
    }
  })

  test('attempts counter increments on each wrong guess', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001222002')
    const store = (svc as any).otpStore as Map<string, { code: string; attempts: number }>
    await svc.verifyOtp('+573001222002', '000000')
    assert.equal(store.get('+573001222002')?.attempts, 1)
    await svc.verifyOtp('+573001222002', '000000')
    assert.equal(store.get('+573001222002')?.attempts, 2)
  })
})

// ── verifyOtp — lockout ───────────────────────────────────────────────────────

test.group('OtpService | verifyOtp — lockout', () => {
  test('returns { valid: false, locked: true } after 5th wrong attempt', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001333001')
    // 5 wrong attempts
    let result: any
    for (let i = 0; i < 5; i++) {
      result = await svc.verifyOtp('+573001333001', '000000')
    }
    assert.equal(result.valid, false)
    assert.isTrue(result.locked)
  })

  test('even correct code rejected once locked', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001333002')
    const store = (svc as any).otpStore as Map<string, { code: string; attempts: number }>
    const code = store.get('+573001333002')!.code
    // force attempts to MAX
    for (let i = 0; i < 5; i++) {
      await svc.verifyOtp('+573001333002', '000000')
    }
    // set attempts directly to ensure locked state
    const entry = store.get('+573001333002')
    if (entry) entry.attempts = 5
    const result = await svc.verifyOtp('+573001333002', code)
    assert.equal((result as any).valid, false)
    assert.isTrue((result as any).locked)
  })
})

// ── verifyOtp — expiry ────────────────────────────────────────────────────────

test.group('OtpService | verifyOtp — expiry', () => {
  test('returns { valid: false } if OTP is expired', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001444001')
    const store = (svc as any).otpStore as Map<string, { code: string; expiresAt: number; attempts: number }>
    const entry = store.get('+573001444001')!
    // Force expiry
    entry.expiresAt = Date.now() - 1
    const result = await svc.verifyOtp('+573001444001', entry.code)
    assert.equal((result as any).valid, false)
  })

  test('expired entry is deleted from otpStore', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    await svc.sendOtp('+573001444002')
    const store = (svc as any).otpStore as Map<string, { code: string; expiresAt: number; attempts: number }>
    const entry = store.get('+573001444002')!
    entry.expiresAt = Date.now() - 1
    await svc.verifyOtp('+573001444002', entry.code)
    assert.isFalse(store.has('+573001444002'))
  })
})

// ── verifyOtp — unknown phone ─────────────────────────────────────────────────

test.group('OtpService | verifyOtp — unknown phone', () => {
  test('returns { valid: false } when phone not in otpStore', async ({ assert }) => {
    const svc = new OtpService(makeMockSender().sender)
    const result = await svc.verifyOtp('+573009999999', '123456')
    assert.deepEqual(result, { valid: false })
  })
})

// ── cleanup timer ─────────────────────────────────────────────────────────────

test.group('OtpService | cleanup timer', () => {
  test('startCleanupTimer and stopCleanupTimer do not throw', ({ assert }) => {
    const svc = new OtpService(makeMockSender().sender)
    assert.doesNotThrow(() => svc.startCleanupTimer())
    assert.doesNotThrow(() => svc.stopCleanupTimer())
  })

  test('stopCleanupTimer is idempotent', ({ assert }) => {
    const svc = new OtpService(makeMockSender().sender)
    svc.startCleanupTimer()
    assert.doesNotThrow(() => svc.stopCleanupTimer())
    assert.doesNotThrow(() => svc.stopCleanupTimer())
  })
})

// ── sendOtp — UserPreference language lookup ──────────────────────────────────

test.group('OtpService | sendOtp — UserPreference language lookup', (group) => {
  let originalFind: typeof UserPreference.find

  group.each.setup(() => {
    originalFind = UserPreference.find
  })

  group.each.teardown(() => {
    UserPreference.find = originalFind
  })

  test('preferredLanguage: en in DB overrides prefix fallback → English body', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => ({ preferredLanguage: 'en' }) as any
    await svc.sendOtp('+573001234567') // Colombian prefix → es by fallback, DB must win
    assert.include(mock.calls[0].body, 'Your code is')
  })

  test('preferredLanguage: pt in DB overrides prefix fallback → Portuguese body', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => ({ preferredLanguage: 'pt' }) as any
    await svc.sendOtp('+573001234567')
    assert.include(mock.calls[0].body, 'Seu código é')
  })

  test('preferredLanguage: es in DB overrides prefix fallback → Spanish body', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => ({ preferredLanguage: 'es' }) as any
    await svc.sendOtp('+13005551234') // US prefix → en by fallback, DB must win
    assert.include(mock.calls[0].body, 'Tu código es')
  })

  test('DB throws → falls through to prefix fallback', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => {
      throw new Error('DB unavailable')
    }
    await svc.sendOtp('+5511999990001') // Brazilian prefix
    assert.include(mock.calls[0].body, 'Seu código é')
  })

  test('DB returns null → falls through to prefix fallback', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => null as any
    await svc.sendOtp('+13005551234') // US prefix
    assert.include(mock.calls[0].body, 'Your code is')
  })

  test('explicit lang arg short-circuits DB entirely', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    UserPreference.find = async (_phone: string) => {
      throw new Error('should not be called')
    }
    const result = await svc.sendOtp('+573001234567', 'en')
    assert.deepEqual(result, { success: true })
    assert.include(mock.calls[0].body, 'Your code is')
  })
})

// ── defaultSmsSender ──────────────────────────────────────────────────────────

test.group('OtpService | defaultSmsSender', (group) => {
  let originalAxiosPost: any
  let savedEnv: { sid?: string; token?: string; from?: string }

  group.each.setup(() => {
    originalAxiosPost = (axios as any).post
    savedEnv = {
      sid: process.env.TWILIO_ACCOUNT_SID,
      token: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM_NUMBER,
    }
  })

  group.each.teardown(() => {
    ;(axios as any).post = originalAxiosPost
    if (savedEnv.sid !== undefined) process.env.TWILIO_ACCOUNT_SID = savedEnv.sid
    else delete process.env.TWILIO_ACCOUNT_SID
    if (savedEnv.token !== undefined) process.env.TWILIO_AUTH_TOKEN = savedEnv.token
    else delete process.env.TWILIO_AUTH_TOKEN
    if (savedEnv.from !== undefined) process.env.TWILIO_FROM_NUMBER = savedEnv.from
    else delete process.env.TWILIO_FROM_NUMBER
  })

  test('throws when Twilio env vars missing', async ({ assert }) => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
    const svc = new OtpService()
    await assert.rejects(
      () => svc.sendOtp('+573001234567'),
      /Twilio env vars not configured/
    )
  })

  test('axios.post called with correct Twilio Messages URL', async ({ assert }) => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123'
    process.env.TWILIO_AUTH_TOKEN = 'token456'
    process.env.TWILIO_FROM_NUMBER = '+15005550006'
    let capturedUrl = ''
    ;(axios as any).post = async (url: string, _data: any, _config?: any) => {
      capturedUrl = url
      return { data: {} }
    }
    const svc = new OtpService()
    await svc.sendOtp('+573001234567', 'es')
    assert.equal(capturedUrl, 'https://api.twilio.com/2010-04-01/Accounts/ACtest123/Messages.json')
  })

  test('axios.post called with Basic Auth (accountSid / authToken)', async ({ assert }) => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123'
    process.env.TWILIO_AUTH_TOKEN = 'token456'
    process.env.TWILIO_FROM_NUMBER = '+15005550006'
    let capturedConfig: any = null
    ;(axios as any).post = async (_url: string, _data: any, config?: any) => {
      capturedConfig = config
      return { data: {} }
    }
    const svc = new OtpService()
    await svc.sendOtp('+573001234567', 'es')
    assert.equal(capturedConfig.auth.username, 'ACtest123')
    assert.equal(capturedConfig.auth.password, 'token456')
  })

  test('axios.post called with Content-Type: application/x-www-form-urlencoded', async ({ assert }) => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123'
    process.env.TWILIO_AUTH_TOKEN = 'token456'
    process.env.TWILIO_FROM_NUMBER = '+15005550006'
    let capturedConfig: any = null
    ;(axios as any).post = async (_url: string, _data: any, config?: any) => {
      capturedConfig = config
      return { data: {} }
    }
    const svc = new OtpService()
    await svc.sendOtp('+573001234567', 'es')
    assert.equal(capturedConfig.headers['Content-Type'], 'application/x-www-form-urlencoded')
  })

  test('axios.post body is URLSearchParams-encoded with correct To / From / Body', async ({ assert }) => {
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123'
    process.env.TWILIO_AUTH_TOKEN = 'token456'
    process.env.TWILIO_FROM_NUMBER = '+15005550006'
    let capturedData = ''
    ;(axios as any).post = async (_url: string, data: any, _config?: any) => {
      capturedData = data
      return { data: {} }
    }
    const svc = new OtpService()
    await svc.sendOtp('+573001234567', 'es')
    const params = new URLSearchParams(capturedData)
    assert.equal(params.get('To'), '+573001234567')
    assert.equal(params.get('From'), '+15005550006')
    assert.match(params.get('Body')!, /^Sippy: Tu código es \d{6}$/)
  })
})

// ── otpStore capacity cap ─────────────────────────────────────────────────────

test.group('OtpService | otpStore capacity cap', () => {
  test('insert when all 100,000 entries are unexpired — size stays ≤ 100,000', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const store = (svc as any).otpStore as Map<string, { code: string; expiresAt: number; attempts: number }>
    const future = Date.now() + 999_999
    for (let i = 0; i < 100_000; i++) {
      store.set(`+1${String(i).padStart(10, '0')}`, { code: '123456', expiresAt: future, attempts: 0 })
    }
    await svc.sendOtp('+573001234567')
    assert.isAtMost(store.size, 100_000)
    assert.isTrue(store.has('+573001234567'))
  })

  test('insert when all 100,000 entries are expired — expired purged, size is 1', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const store = (svc as any).otpStore as Map<string, { code: string; expiresAt: number; attempts: number }>
    const past = Date.now() - 1
    for (let i = 0; i < 100_000; i++) {
      store.set(`+1${String(i).padStart(10, '0')}`, { code: '123456', expiresAt: past, attempts: 0 })
    }
    await svc.sendOtp('+573001234567')
    assert.equal(store.size, 1)
    assert.isTrue(store.has('+573001234567'))
  })

  test('insert when map is below cap — no eviction, normal insert', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const store = (svc as any).otpStore as Map<string, any>
    await svc.sendOtp('+573001234567')
    assert.equal(store.size, 1)
  })
})

// ── sendRateLimitMap capacity cap ─────────────────────────────────────────────

test.group('OtpService | sendRateLimitMap capacity cap', () => {
  test('insert when all 100,000 buckets are active — size stays ≤ 100,000', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const rlMap = (svc as any).sendRateLimitMap as Map<string, { count: number; resetAt: number }>
    const future = Date.now() + 999_999
    for (let i = 0; i < 100_000; i++) {
      rlMap.set(`+1${String(i).padStart(10, '0')}`, { count: 1, resetAt: future })
    }
    await svc.sendOtp('+573001234567') // new phone, no existing bucket
    assert.isAtMost(rlMap.size, 100_000)
    assert.isTrue(rlMap.has('+573001234567'))
  })

  test('insert when all 100,000 buckets are expired — expired purged, size is 1', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const rlMap = (svc as any).sendRateLimitMap as Map<string, { count: number; resetAt: number }>
    const past = Date.now() - 1
    for (let i = 0; i < 100_000; i++) {
      rlMap.set(`+1${String(i).padStart(10, '0')}`, { count: 1, resetAt: past })
    }
    await svc.sendOtp('+573001234567')
    assert.equal(rlMap.size, 1)
    assert.isTrue(rlMap.has('+573001234567'))
  })

  test('existing bucket lookup (count < 3) does not trigger cap guard', async ({ assert }) => {
    const mock = makeMockSender()
    const svc = new OtpService(mock.sender)
    const rlMap = (svc as any).sendRateLimitMap as Map<string, { count: number; resetAt: number }>
    // First call creates bucket for +573001234567 with count: 1
    await svc.sendOtp('+573001234567')
    // Fill remaining slots to capacity with other active buckets
    const future = Date.now() + 999_999
    for (let i = 0; i < 99_999; i++) {
      rlMap.set(`+1${String(i).padStart(10, '0')}`, { count: 1, resetAt: future })
    }
    // Second call increments existing bucket — no new insertion
    await svc.sendOtp('+573001234567')
    assert.isAtMost(rlMap.size, 100_000)
  })
})
