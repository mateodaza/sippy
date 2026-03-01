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
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Admin Roles</h1>
          <p className="mt-1 text-sm text-gray-500">Manage admin user access levels</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#bbf7d0] bg-sippy-lightest px-3.5 py-1.5 text-sm font-medium text-[#15803d] shadow-sm">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          {admins.length} admins
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Admin</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {admins.map((admin) => (
              <tr key={admin.id} className="transition-colors hover:bg-sippy-lightest/30">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sippy-lighter text-xs font-bold text-sippy-darker">
                      {admin.full_name
                        ? admin.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)
                        : admin.email[0].toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-700">{admin.full_name || '---'}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-gray-500">{admin.email}</td>
                <td className="px-5 py-4">
                  <select
                    value={admin.role}
                    onChange={(e) => handleRoleChange(admin.id, e.target.value)}
                    className="rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium transition-all duration-200 focus:border-sippy focus:ring-2 focus:ring-sippy/10 focus:outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td className="px-5 py-4 text-gray-400">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                  No admin users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  )
}
