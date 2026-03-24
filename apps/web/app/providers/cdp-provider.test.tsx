import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, afterEach } from 'vitest'

// capturedConfig lives in test file scope — survives vi.resetModules()
let capturedConfig: unknown

// Hoisted mock for @coinbase/cdp-hooks — factory persists across resetModules
vi.mock('@coinbase/cdp-hooks', () => ({
  CDPHooksProvider: ({ config, children }: { config: unknown; children: React.ReactNode }) => {
    capturedConfig = config
    return React.createElement(React.Fragment, null, children)
  },
}))

// Hoisted mock for ../../lib/auth — factory persists across resetModules
vi.mock('../../lib/auth', () => ({
  getFreshToken: vi.fn(),
}))

// NO top-level static import of CDPProviderCustomAuth or getFreshToken.
// Both are imported dynamically per-test after resetModules + stubEnv.

function renderComponent(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    createRoot(container).render(element)
  })
  document.body.removeChild(container)
}

describe('CDPProviderCustomAuth', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    capturedConfig = undefined
  })

  it('does not render CDPHooksProvider when project ID is absent', async () => {
    // Explicitly stub to '' — never rely on the env being absent in CI
    vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', '')
    const { CDPProviderCustomAuth } = await import('./cdp-provider')
    renderComponent(React.createElement(CDPProviderCustomAuth, null, React.createElement('div')))
    expect(capturedConfig).toBeUndefined()
  })

  describe('customAuth.getJwt — with project ID set', () => {
    it('returns the stored token when getFreshToken returns a string', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
      const { CDPProviderCustomAuth } = await import('./cdp-provider')
      const { getFreshToken } = await import('../../lib/auth')
      vi.mocked(getFreshToken).mockReturnValue('valid.jwt.token')
      renderComponent(React.createElement(CDPProviderCustomAuth, null, React.createElement('div')))
      const getJwt = (capturedConfig as any).customAuth.getJwt
      await expect(getJwt()).resolves.toBe('valid.jwt.token')
    })

    it('returns undefined when getFreshToken returns null (no token stored)', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
      const { CDPProviderCustomAuth } = await import('./cdp-provider')
      const { getFreshToken } = await import('../../lib/auth')
      vi.mocked(getFreshToken).mockReturnValue(null)
      renderComponent(React.createElement(CDPProviderCustomAuth, null, React.createElement('div')))
      const getJwt = (capturedConfig as any).customAuth.getJwt
      await expect(getJwt()).resolves.toBeUndefined()
    })

    it('returns undefined when getFreshToken returns null (expired token)', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
      const { CDPProviderCustomAuth } = await import('./cdp-provider')
      const { getFreshToken } = await import('../../lib/auth')
      vi.mocked(getFreshToken).mockReturnValue(null)
      renderComponent(React.createElement(CDPProviderCustomAuth, null, React.createElement('div')))
      const getJwt = (capturedConfig as any).customAuth.getJwt
      await expect(getJwt()).resolves.toBeUndefined()
    })

    it('getJwt is async (returns a Promise)', async () => {
      vi.stubEnv('NEXT_PUBLIC_CDP_PROJECT_ID', 'test-project-id')
      const { CDPProviderCustomAuth } = await import('./cdp-provider')
      const { getFreshToken } = await import('../../lib/auth')
      vi.mocked(getFreshToken).mockReturnValue('tok')
      renderComponent(React.createElement(CDPProviderCustomAuth, null, React.createElement('div')))
      const getJwt = (capturedConfig as any).customAuth.getJwt
      expect(getJwt()).toBeInstanceOf(Promise)
    })
  })
})
