import { Head, useForm } from '@inertiajs/react'
import type { FormEvent } from 'react'

export default function Login() {
  const { data, setData, post, processing, errors } = useForm({
    email: '',
    password: '',
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    post('/admin/login')
  }

  return (
    <>
      <Head title="Login" />

      <div
        className="flex min-h-screen items-center justify-center font-sans grid-bg"
        style={{ backgroundColor: 'var(--admin-bg)' }}
      >
        <div className="relative w-full max-w-md px-6">
          {/* Brand */}
          <div className="mb-8 flex flex-col items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="80 376 864 272"
              className="h-8 w-auto text-brand"
              aria-label="Sippy"
              role="img"
            >
              <rect fill="currentColor" x="80" y="376" width="160" height="32" />
              <rect fill="currentColor" x="80" y="426" width="160" height="32" />
              <rect fill="currentColor" x="208" y="476" width="32" height="172" />
              <rect fill="currentColor" x="80" y="616" width="160" height="32" />
              <rect fill="currentColor" x="280" y="376" width="64" height="32" />
              <rect fill="currentColor" x="312" y="376" width="32" height="272" />
              <rect fill="currentColor" x="384" y="376" width="32" height="272" />
              <rect fill="currentColor" x="384" y="376" width="160" height="32" />
              <rect fill="currentColor" x="512" y="376" width="32" height="160" />
              <rect fill="currentColor" x="384" y="512" width="160" height="32" />
              <rect fill="currentColor" x="584" y="376" width="32" height="272" />
              <rect fill="currentColor" x="584" y="376" width="160" height="32" />
              <rect fill="currentColor" x="712" y="376" width="32" height="160" />
              <rect fill="currentColor" x="584" y="512" width="160" height="32" />
              <rect fill="currentColor" x="784" y="376" width="32" height="160" />
              <rect fill="currentColor" x="784" y="512" width="160" height="32" />
              <rect fill="currentColor" x="912" y="376" width="32" height="272" />
            </svg>
            <p className="spec-label mt-2">ADMIN PANEL // SIGN IN</p>
          </div>

          {/* Card */}
          <div className="panel-frame p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="login-email" className="spec-label mb-2 block">
                  EMAIL
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={data.email}
                  onChange={(e) => setData('email', e.target.value)}
                  className="w-full border px-4 py-3 font-mono text-[15px] transition-colors focus:border-brand focus:ring-1 focus:ring-brand/20 focus-visible:outline-none"
                  style={{
                    backgroundColor: 'var(--admin-surface)',
                    borderColor: 'var(--admin-border)',
                    color: 'var(--admin-text)',
                  }}
                  placeholder="admin@sippy.lat"
                  required
                />
                {errors.email && (
                  <p
                    className="mt-1.5 font-mono text-[13px] font-bold tracking-wider text-danger"
                    role="alert"
                  >
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="login-password" className="spec-label mb-2 block">
                  PASSWORD
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  className="w-full border px-4 py-3 font-mono text-[15px] transition-colors focus:border-brand focus:ring-1 focus:ring-brand/20 focus-visible:outline-none"
                  style={{
                    backgroundColor: 'var(--admin-surface)',
                    borderColor: 'var(--admin-border)',
                    color: 'var(--admin-text)',
                  }}
                  placeholder="Enter your password"
                  required
                />
                {errors.password && (
                  <p
                    className="mt-1.5 font-mono text-[13px] font-bold tracking-wider text-danger"
                    role="alert"
                  >
                    {errors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={processing}
                className="w-full bg-brand px-6 py-3.5 font-mono text-[15px] font-bold tracking-[0.12em] uppercase text-white transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none"
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    SIGNING IN...
                  </span>
                ) : (
                  'SIGN IN'
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center font-mono text-[13px] tracking-[0.2em] uppercase admin-text-muted">
            SIPPY ADMIN // {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </>
  )
}
