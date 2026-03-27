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
          <h1 className="font-sans text-2xl font-bold uppercase tracking-[0.05em] text-brand-dark">
            Admin Roles
          </h1>
          <p className="spec-label mt-1" style={{ color: 'rgba(0, 175, 215, 0.5)' }}>
            ACCESS LEVEL MANAGEMENT
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="indicator-dot indicator-dot-active" />
          <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-crypto-hover">
            {admins.length} ADMINS
          </span>
        </div>
      </div>

      <div className="panel-frame overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand/10 bg-brand-light">
              <th className="px-5 py-3 text-left spec-label">ADMIN</th>
              <th className="px-5 py-3 text-left spec-label">EMAIL</th>
              <th className="px-5 py-3 text-left spec-label">ROLE</th>
              <th className="px-5 py-3 text-left spec-label">CREATED</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand/5">
            {admins.map((admin) => (
              <tr key={admin.id} className="transition-colors hover:bg-brand-light/50">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center border border-brand/20 font-mono text-[10px] font-bold tracking-wider text-brand">
                      {admin.full_name
                        ? admin.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                        : admin.email[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-brand-dark">
                      {admin.full_name || '---'}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 font-mono text-[11px] text-brand-dark/50">
                  {admin.email}
                </td>
                <td className="px-5 py-3.5">
                  <select
                    value={admin.role}
                    onChange={(e) => handleRoleChange(admin.id, e.target.value)}
                    className="border border-brand/20 bg-white px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider uppercase text-brand-dark transition-colors focus:border-brand focus:ring-1 focus:ring-brand/20 focus:outline-none"
                  >
                    <option value="admin">ADMIN</option>
                    <option value="viewer">VIEWER</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 font-mono text-[10px] tracking-wider text-brand-dark/40">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-5 py-12 text-center font-mono text-[10px] tracking-wider text-brand-dark/40"
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
