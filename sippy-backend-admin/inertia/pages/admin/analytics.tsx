import { Head } from '@inertiajs/react'
import AdminLayout from '../../layouts/admin_layout.js'

interface SourceRow {
  parse_source: string
  total: string
}

interface IntentRow {
  intent: string
  total: string
}

interface DayRow {
  day: string
  total: string
}

interface Props {
  parseBySource: SourceRow[]
  topIntents: IntentRow[]
  messagesPerDay: DayRow[]
}

export default function Analytics({ parseBySource, topIntents, messagesPerDay }: Props) {
  const maxMessages = Math.max(...messagesPerDay.map((d) => Number(d.total)), 1)

  return (
    <AdminLayout>
      <Head title="Analytics" />

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Message parsing and usage statistics</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Parse source breakdown */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">Parse Source</h2>
          <div className="space-y-3">
            {parseBySource.map((row) => {
              const total = Number(row.total)
              const allTotal = parseBySource.reduce((s, r) => s + Number(r.total), 0)
              const pct = allTotal > 0 ? Math.round((total / allTotal) * 100) : 0
              return (
                <div key={row.parse_source}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium capitalize text-slate-700">
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        row.parse_source === 'llm' ? 'bg-[#9333ea]' : 'bg-sippy'
                      }`} />
                      {row.parse_source}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{total.toLocaleString()}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        row.parse_source === 'llm' ? 'bg-[#9333ea]' : 'bg-sippy'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {parseBySource.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>

        {/* Top intents */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">Top Intents</h2>
          <div className="space-y-2.5">
            {topIntents.map((row, i) => (
              <div
                key={row.intent}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50"
              >
                <span className="flex items-center gap-3 text-sm text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sippy-lightest text-xs font-bold text-sippy-darker">
                    {i + 1}
                  </span>
                  {row.intent}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {Number(row.total).toLocaleString()}
                </span>
              </div>
            ))}
            {topIntents.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">No data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Messages per day chart */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)]">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Messages Per Day (Last 14 Days)
        </h2>

        {messagesPerDay.length > 0 ? (
          <div className="flex items-end gap-2" style={{ height: 180 }}>
            {messagesPerDay.map((row) => {
              const pct = (Number(row.total) / maxMessages) * 100
              return (
                <div key={row.day} className="group flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-slate-700 opacity-0 transition-opacity group-hover:opacity-100">
                    {Number(row.total).toLocaleString()}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-sippy to-sippy-light transition-all duration-300 group-hover:from-sippy-dark group-hover:to-sippy"
                    style={{ height: `${Math.max(pct, 4)}%` }}
                  />
                  <span className="mt-1 text-[10px] text-gray-400">
                    {new Date(row.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">No data yet</p>
        )}
      </div>
    </AdminLayout>
  )
}
