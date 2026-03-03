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

      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-[#eefaf4] to-[#f8fbff] font-sans">
        {/* Decorative blurs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-sippy-lightest opacity-60 blur-[150px]" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-[#dbeafe] opacity-40 blur-[150px]" />
        </div>

        <div className="relative w-full max-w-md px-6">
          {/* Logo / Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sippy to-sippy-dark shadow-[0_8px_32px_-8px_rgba(16,185,129,0.3)]">
              <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Sippy Admin</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your dashboard</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-gray-100 bg-white/90 p-8 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={data.email}
                  onChange={(e) => setData('email', e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-sippy focus:ring-2 focus:ring-sippy/10 focus:outline-none"
                  placeholder="admin@sippy.lat"
                  required
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={data.password}
                  onChange={(e) => setData('password', e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm transition-all duration-200 placeholder:text-gray-400 focus:border-sippy focus:ring-2 focus:ring-sippy/10 focus:outline-none"
                  placeholder="Enter your password"
                  required
                />
                {errors.password && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{errors.password}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={processing}
                className="w-full rounded-xl bg-sippy px-7 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(5,150,105,0.22)] transition-all duration-200 hover:bg-sippy-dark hover:shadow-[0_22px_44px_rgba(4,120,87,0.28)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Sippy Admin Dashboard
          </p>
        </div>
      </div>
    </>
  )
}
