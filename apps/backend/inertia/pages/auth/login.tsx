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

      <div className="flex min-h-screen items-center justify-center bg-white font-sans grid-bg">
        <div className="relative w-full max-w-md px-6">
          {/* Brand */}
          <div className="mb-8 text-center">
            <div className="font-sans text-3xl font-bold uppercase tracking-[0.1em] text-brand-dark">
              Sippy
            </div>
            <p className="spec-label mt-2" style={{ color: 'rgba(0, 175, 215, 0.5)' }}>
              ADMIN PANEL // SIGN IN
            </p>
          </div>

          {/* Card */}
          <div className="panel-frame p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="spec-label mb-2 block">EMAIL</label>
                <input
                  type="email"
                  value={data.email}
                  onChange={(e) => setData('email', e.target.value)}
                  className="w-full border border-brand/20 bg-white px-4 py-3 font-mono text-sm text-brand-dark transition-colors placeholder:text-brand-dark/25 focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none"
                  placeholder="admin@sippy.lat"
                  required
                />
                {errors.email && (
                  <p className="mt-1.5 font-mono text-[10px] font-bold tracking-wider text-danger">
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label className="spec-label mb-2 block">PASSWORD</label>
                <input
                  type="password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  className="w-full border border-brand/20 bg-white px-4 py-3 font-mono text-sm text-brand-dark transition-colors placeholder:text-brand-dark/25 focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none"
                  placeholder="Enter your password"
                  required
                />
                {errors.password && (
                  <p className="mt-1.5 font-mono text-[10px] font-bold tracking-wider text-danger">
                    {errors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={processing}
                className="w-full bg-brand px-6 py-3.5 font-mono text-sm font-bold tracking-[0.12em] uppercase text-white transition-colors hover:bg-brand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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

          <p className="mt-6 text-center font-mono text-[9px] tracking-[0.2em] uppercase text-brand-dark/40">
            SIPPY ADMIN // {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </>
  )
}
