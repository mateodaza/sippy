/**
 * AdminRoleMiddleware unit tests.
 *
 * Covers the role gate semantics:
 *   role: 'admin'    → only admin passes
 *   role: 'operator' → operator OR admin passes (admin is a superset)
 *
 * Rejection branches:
 *   HTML accept → session flash + redirect-back
 *   JSON accept → 403 response.forbidden({error})
 *
 * Spec: OPERATOR_FLOW_PLAN.md "Authorization layer, Capa 1".
 */

import { test } from '@japa/runner'
import AdminRoleMiddleware from '#middleware/admin_role_middleware'
import type { HttpContext } from '@adonisjs/core/http'

interface CapturedFlash {
  key: string
  value: string
}

interface CapturedResponse {
  forbiddenBody?: unknown
  redirectedBack?: boolean
}

function makeCtx(args: { role: 'admin' | 'viewer' | 'operator'; acceptsJson?: boolean }): {
  ctx: HttpContext
  captured: { flashes: CapturedFlash[]; response: CapturedResponse }
} {
  const flashes: CapturedFlash[] = []
  const responseState: CapturedResponse = {}
  const ctx = {
    auth: { user: { id: 1, role: args.role } },
    request: {
      url: () => '/admin/some-path',
      accepts: (_: string[]) => (args.acceptsJson ? 'json' : 'html'),
    },
    response: {
      forbidden: (body: unknown) => {
        responseState.forbiddenBody = body
        return body
      },
      redirect: () => ({
        back: () => {
          responseState.redirectedBack = true
          return undefined
        },
      }),
    },
    session: {
      flash: (key: string, value: string) => flashes.push({ key, value }),
    },
  } as unknown as HttpContext
  return { ctx, captured: { flashes, response: responseState } }
}

test.group('admin_role_middleware', () => {
  test('role=admin: admin user passes', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'admin' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'admin' }
    )
    assert.isTrue(called)
    assert.isUndefined(captured.response.forbiddenBody)
    assert.isUndefined(captured.response.redirectedBack)
  })

  test('role=admin: operator is rejected', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'operator' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'admin' }
    )
    assert.isFalse(called, 'next() should not run')
    assert.isTrue(captured.response.redirectedBack)
  })

  test('role=admin: viewer is rejected', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'viewer' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'admin' }
    )
    assert.isFalse(called)
    assert.isTrue(captured.response.redirectedBack)
  })

  test('role=operator: operator passes', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx } = makeCtx({ role: 'operator' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'operator' }
    )
    assert.isTrue(called)
  })

  test('role=operator: admin also passes (admin is superset)', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx } = makeCtx({ role: 'admin' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'operator' }
    )
    assert.isTrue(called, 'admin must be able to do anything operator can')
  })

  test('role=operator: viewer is rejected', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'viewer' })
    let called = false
    await mw.handle(
      ctx,
      async () => {
        called = true
      },
      { role: 'operator' }
    )
    assert.isFalse(called)
    assert.isTrue(captured.response.redirectedBack)
  })

  test('JSON accept: rejection writes 403 forbidden() instead of redirect', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'viewer', acceptsJson: true })
    await mw.handle(ctx, async () => {}, { role: 'admin' })
    assert.deepEqual(captured.response.forbiddenBody, { error: 'Insufficient permissions' })
    assert.isUndefined(captured.response.redirectedBack)
  })

  test('HTML accept: rejection sets flash + redirects back', async ({ assert }) => {
    const mw = new AdminRoleMiddleware()
    const { ctx, captured } = makeCtx({ role: 'viewer', acceptsJson: false })
    await mw.handle(ctx, async () => {}, { role: 'admin' })
    assert.equal(captured.flashes.length, 1)
    assert.equal(captured.flashes[0].key, 'error')
    assert.isTrue(captured.response.redirectedBack)
  })
})
