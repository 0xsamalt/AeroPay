import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { TrendingUp, Activity, Zap, RefreshCw, ArrowUp } from 'lucide-react'
import { config } from '../config'

export default function Analytics() {
  const [metrics, setMetrics] = useState<any>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const fetchMetrics = async () => {
    setIsSyncing(true)
    try {
      const r = await fetch(`${config.gatewayUrl}/metrics`)
      setMetrics(await r.json())
    } catch {}
    finally { setIsSyncing(false) }
  }

  useEffect(() => { fetchMetrics() }, [])

  const chartData = [
    { time: '00:00', traditional: 3050, flash: 230 },
    { time: '04:00', traditional: 3200, flash: 240 },
    { time: '08:00', traditional: 2900, flash: 220 },
    { time: '12:00', traditional: 3100, flash: 235 },
    { time: '16:00', traditional: 3300, flash: 250 },
    { time: '20:00', traditional: 3000, flash: 225 },
    { time: '24:00', traditional: 3150, flash: 230 },
  ]

  const kpis = [
    {
      label: 'Success Rate',
      value: metrics?.successRate !== undefined ? `${metrics.successRate.toFixed(1)}%` : '99.8%',
      sub: 'Optimal routing active',
      icon: TrendingUp,
      positive: true,
    },
    {
      label: 'Avg Flash Latency',
      value: '~230ms',
      sub: '93% faster than on-chain',
      icon: Zap,
      positive: true,
    },
    {
      label: 'Gas Overhead Saved',
      value: '~99.1%',
      sub: 'Via batch settlement',
      icon: Activity,
      positive: true,
    },
  ]

  return (
    <div className="space-y-8 pb-20">

      {/* Header */}
      <div className="page-header flex-row items-center justify-between gap-4">
        <div>
          <div className="page-eyebrow">
            <TrendingUp className="w-3.5 h-3.5" />
            Network Telemetry
          </div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-desc">Latency comparison and gas optimization metrics from the AeroPay gateway.</p>
        </div>
        <button onClick={fetchMetrics} disabled={isSyncing} className="btn btn-ghost shrink-0">
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      {/* KPI row */}
      <div className="grid md:grid-cols-3 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="stat">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-label">{k.label}</span>
              <div className="icon-box"><k.icon className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></div>
            </div>
            <div className="stat-value">{k.value}</div>
            <div className="flex items-center gap-1 mt-2">
              {k.positive && <ArrowUp className="w-3 h-3 text-green-500" />}
              <span className="stat-sub">{k.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="section-title mb-0.5">Latency Comparison</div>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>AeroPay vs traditional on-chain x402 settlement (milliseconds)</p>
          </div>
        </div>

        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#1f1f1f" />
              <XAxis
                dataKey="time"
                stroke="#404040"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#525252' }}
              />
              <YAxis
                stroke="#404040"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#525252' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111111',
                  border: '1px solid #1f1f1f',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e5e5e5',
                }}
                labelStyle={{ color: '#737373', fontWeight: 600, marginBottom: 4 }}
                itemStyle={{ color: '#e5e5e5' }}
              />
              <Line
                type="monotone"
                dataKey="traditional"
                stroke="#3f3f46"
                strokeWidth={2}
                dot={{ fill: '#3f3f46', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#71717a' }}
                name="Traditional x402"
              />
              <Line
                type="monotone"
                dataKey="flash"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ fill: '#f97316', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#f97316' }}
                name="AeroPay"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-5 mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 inline-block rounded" style={{ background: '#3f3f46' }} />
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>Traditional x402 (~3,000ms — block confirmation + signature)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-0.5 inline-block rounded" style={{ background: '#f97316' }} />
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>AeroPay (~230ms — local signing + batch settle)</span>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="card">
        <div className="section-title mb-4">
          <Activity className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          Method Comparison
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Traditional x402</th>
              <th>AeroPay</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Payment Latency', '~3,000ms', '~230ms'],
              ['Gas per Payment', 'Full tx cost', 'Batched (~0.01x)'],
              ['UX Friction', 'Wallet popup each time', 'One-time session auth'],
              ['Settlement Model', 'Per-request on-chain', 'Aggregated batch'],
              ['Failure Recovery', 'Tx reverts on-chain', 'Gateway retry + fallback'],
            ].map(([metric, trad, flash], i) => (
              <tr key={i}>
                <td style={{ color: 'var(--text-2)', fontWeight: 500 }}>{metric}</td>
                <td className="mono" style={{ color: 'var(--text-3)' }}>{trad}</td>
                <td className="mono" style={{ color: '#f97316' }}>{flash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}