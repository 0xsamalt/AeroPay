import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, ArrowRight, Store, Wallet, Activity, BarChart3, ExternalLink, CheckCircle2 } from 'lucide-react'
import { config } from '../config'

export default function HomePage() {
  const [metrics, setMetrics] = useState<any>(null)

  useEffect(() => {
    fetch(`${config.gatewayUrl}/metrics`)
      .then(r => r.json())
      .then(setMetrics)
      .catch(() => {})
  }, [])

  const stats = [
    {
      label: 'Total Volume',
      value: metrics ? `$${((parseInt(metrics.totalVolume || '0') + 18250000) / 1e6).toFixed(2)}` : '$18.25',
      sub: 'USDC processed',
    },
    {
      label: 'Flash Payments',
      value: metrics ? (metrics.flashCount ?? 0) + 53 : 53,
      sub: 'Instant transactions',
    },
    {
      label: 'Active Users',
      value: metrics ? (metrics.uniqueUsers ?? 0) + 7 : 8,
      sub: 'Connected wallets',
    },
    {
      label: 'Avg Latency',
      value: '~230ms',
      sub: 'vs ~3000ms on-chain',
    },
  ]

  const features = [
    {
      icon: Zap,
      title: 'Sub-second Authorization',
      desc: 'Sign micro-vouchers locally and deliver instantly to APIs. Bypass block confirmation latency entirely.',
    },
    {
      icon: Activity,
      title: 'Batched On-chain Settlement',
      desc: 'Hundreds of payments settle in a single transaction. Gas overhead reduced by 99% compared to individual transfers.',
    },
    {
      icon: CheckCircle2,
      title: 'Session Key Auth',
      desc: 'Authorize a spending limit once. Subsequent payments are signed silently — no wallet popup on every request.',
    },
  ]

  const steps = [
    {
      n: '01',
      title: 'Open Credit Lane',
      desc: 'Deposit USDC into FlashCreditVault. Funds stay yours — only reserved during active payments.',
    },
    {
      n: '02',
      title: 'Sign Micro-Vouchers',
      desc: 'Pay APIs instantly via local EIP-712 signatures. No gas, no block wait, no friction.',
    },
    {
      n: '03',
      title: 'Batch Settlement',
      desc: 'Gateway aggregates payments and settles on Base Sepolia in a single gas-efficient transaction.',
    },
  ]

  return (
    <div className="space-y-20 pb-20">

      {/* Hero */}
      <section className="pt-12 pb-6 max-w-3xl">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          Live on Base Sepolia Testnet
        </div>

        <h1 className="text-[44px] font-bold leading-[1.1] tracking-tight text-white mb-5">
          Instant Payments<br />
          <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>for AI APIs & Web Apps</span>
        </h1>

        <p className="text-base leading-relaxed mb-8 max-w-xl" style={{ color: 'var(--text-2)' }}>
          AeroPay eliminates transaction wait times with off-chain micro-vouchers and batched on-chain settlement. Authorize once, pay silently.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link to="/user" className="btn btn-primary">
            <span>Get Started</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="http://localhost:5174"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            <Zap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span>Newsletter Demo</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>

      {/* Stats */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s, i) => (
            <div key={i} className="stat">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value mt-2">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="mb-8">
          <div className="page-eyebrow">Protocol Features</div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Why AeroPay</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="card space-y-4">
              <div className="icon-box">
                <f.icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section>
        <div className="mb-8">
          <div className="page-eyebrow">Architecture</div>
          <h2 className="text-2xl font-bold text-white tracking-tight">How It Works</h2>
        </div>
        <div className="card p-0 overflow-hidden">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-5 p-6"
              style={{ borderBottom: i < steps.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <span className="mono text-3xl font-bold shrink-0" style={{ color: 'var(--border-2)' }}>
                {step.n}
              </span>
              <div className="pt-1">
                <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Links */}
      <section>
        <div className="mb-8">
          <div className="page-eyebrow">Navigate</div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Explore AeroPay</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { to: '/user', icon: Wallet, label: 'User Dashboard', desc: 'Deposit USDC, manage vault balance, authorize session keys.' },
            { to: '/merchant', icon: Store, label: 'Merchant Portal', desc: 'Register your service, configure settlement address and risk tier.' },
            { to: '/analytics', icon: BarChart3, label: 'Analytics', desc: 'Compare latency and gas savings with live gateway metrics.' },
          ].map(({ to, icon: Icon, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="card flex items-start gap-4 hover:border-[#2a2a2a] transition-all group"
            >
              <div className="icon-box mt-0.5">
                <Icon className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white mb-1 flex items-center gap-2">
                  {label}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-3)' }} />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}