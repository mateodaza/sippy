import { Head, router } from '@inertiajs/react'
import AdminLayout from '../../../layouts/admin_layout.js'

interface Admin {
  id: number
  full_name: string | null
  email: string
  role: string
  created_at: string
}

export default function RolesIndex({ admins }: { admins: Admin[] }) {
  function handleRoleChange(id: number, role: string) {
    router.put(`/admin/roles/${id}`, { role }, { preserveScroll: true })
  }

  return (
    <AdminLayout>
      <Head title="Roles" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-3xl font-bold uppercase tracking-[0.05em] admin-text">
            Admin Roles
          </h1>
          <p className="spec-label mt-1">ACCESS LEVEL MANAGEMENT</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator-dot indicator-dot-active" aria-hidden="true" />
          <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-crypto-hover">
            {admins.length} ADMINS
          </span>
        </div>
      </div>

      <div className="panel-frame overflow-hidden">
        <table className="w-full text-[15px]">
          <caption className="sr-only">Admin users and their roles</caption>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--admin-border-subtle)',
                backgroundColor: 'var(--admin-surface)',
              }}
            >
              <th className="px-5 py-3 text-left spec-label">ADMIN</th>
              <th className="px-5 py-3 text-left spec-label">EMAIL</th>
              <th className="px-5 py-3 text-left spec-label">ROLE</th>
              <th className="px-5 py-3 text-left spec-label">CREATED</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--admin-border-subtle)' }}>
            {admins.map((admin) => (
              <tr key={admin.id} className="transition-colors hover:bg-brand-light/50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center font-mono text-[13px] font-bold tracking-wider text-brand"
                      style={{ border: '1px solid var(--admin-border)' }}
                    >
                      {admin.full_name
                        ? admin.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                        : admin.email[0].toUpperCase()}
                    </div>
                    <span className="text-[15px] font-medium admin-text">
                      {admin.full_name || '---'}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono text-[13px] admin-text-secondary">
                  {admin.email}
                </td>
                <td className="px-5 py-3.5">
                  <label className="sr-only" htmlFor={`role-${admin.id}`}>
                    Role for {admin.full_name || admin.email}
                  </label>
                  <select
                    id={`role-${admin.id}`}
                    value={admin.role}
                    onChange={(e) => handleRoleChange(admin.id, e.target.value)}
                    className="border px-3 py-1.5 font-mono text-[13px] font-bold tracking-wider uppercase admin-text transition-colors focus:border-brand focus:ring-1 focus:ring-brand/20 focus-visible:outline-none"
                    style={{
                      backgroundColor: 'var(--admin-surface)',
                      borderColor: 'var(--admin-border)',
                    }}
                  >
                    <option value="admin">ADMIN</option>
                    <option value="viewer">VIEWER</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 font-mono text-[13px] tracking-wider admin-text-muted">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center font-mono text-[13px] tracking-wider admin-text-muted"
                >
                  NO ADMIN USERS YET
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
