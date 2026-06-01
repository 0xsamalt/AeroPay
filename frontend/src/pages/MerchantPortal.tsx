import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { Store, DollarSign, TrendingUp, Copy, CheckCircle2, AlertCircle, RefreshCw, Users } from 'lucide-react'
import { config } from '../config'

const REGISTRY_ABI = [
  {
    name: 'registerMerchant',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'merchant', type: 'address' },
      { name: 'settlement', type: 'address' },
      { name: 'maxOutstanding', type: 'uint256' },
      { name: 'feeBps', type: 'uint16' },
      { name: 'riskTier', type: 'uint8' },
    ],
    outputs: [],
  },
] as const

export default function MerchantPortal() {
  const { address, isConnected } = useAccount()
  const [registered, setRegistered] = useState(false)
  const [stats, setStats] = useState<any>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formData, setFormData] = useState({
    settlement: '',
    maxOutstanding: '1000000000',
    feeBps: '100',
    riskTier: '3',
  })

  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()

  const fetchStatus = async () => {
    if (!address) return
    try {
      const r = await fetch(`${config.gatewayUrl}/api/merchant/${address}/status`)
      const data = await r.json()
      setRegistered(data.registered)
    } catch {}
    try {
      const r = await fetch(`${config.gatewayUrl}/api/merchant/${address}/stats`)
      const data = await r.json()
      setStats(data)
    } catch {}
  }

  useEffect(() => { if (address) fetchStatus() }, [address])

  const handleRegister = async () => {
    if (!address || !publicClient) return
    setIsRegistering(true)
    try {
      const tx = await writeContractAsync({
        address: config.contracts.registry as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'registerMerchant',
        args: [
          address as `0x${string}`,
          (formData.settlement || address) as `0x${string}`,
          BigInt(formData.maxOutstanding),
          parseInt(formData.feeBps),
          parseInt(formData.riskTier),
        ],
      })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      alert('✅ Merchant registered successfully!')
      await fetchStatus()
    } catch (err: any) {
      alert(`❌ Registration failed: ${err.message || err}`)
    } finally {
      setIsRegistering(false)
    }
  }

  const sampleCode = `import { flashOr402 } from '@flash-rail/merchant-middleware'

app.post('/api/service', flashOr402({
  merchantAddress: '${address || '0x...'}',
  settlementAddress: '${formData.settlement || address || '0x...'}',
  token: '${config.contracts.USDC}',
  chainId: ${config.base.chainId},
  price: '50000', // 0.05 USDC
  gatewayUrl: '${config.gatewayUrl}'
}, async (req, res) => {
  res.json({ data: 'Protected response' })
}))`

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="icon-box w-12 h-12 mb-5">
          <Store className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Connect your wallet</h2>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-2)' }}>
          Register your service, configure settlement and view payment metrics.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20">

      {/* Header */}
      <div className="page-header flex-row items-center justify-between gap-4">
        <div>
          <div className="page-eyebrow">
            <Store className="w-3.5 h-3.5" />
            Developer Registry
          </div>
          <h1 className="page-title">Merchant Portal</h1>
          <p className="page-desc">Register your service and start accepting instant micropayments.</p>
        </div>
        {registered && (
          <button onClick={fetchStatus} className="btn btn-ghost shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
      </div>

      {!registered ? (
        <div className="max-w-xl space-y-6">
          {/* Registration notice */}
          <div className="card-sm flex items-start gap-3" style={{ background: 'var(--surface-2)' }}>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Your wallet is not registered as a merchant. Complete the form below to join the AeroPay network.
            </p>
          </div>

          <div className="card space-y-5">
            <div className="section-title">
              <Store className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
              Registration Details
            </div>

            <div>
              <label className="input-label">Settlement Address</label>
              <input
                type="text"
                value={formData.settlement}
                onChange={e => setFormData({ ...formData, settlement: e.target.value })}
                placeholder={address}
                className="input"
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                Where batch settlements are sent. Defaults to your connected wallet.
              </p>
            </div>

            <div>
              <label className="input-label">Max Outstanding Cap (micro-units)</label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.maxOutstanding}
                  onChange={e => setFormData({ ...formData, maxOutstanding: e.target.value })}
                  className="input pr-24"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
                  USDC units
                </span>
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>
                Max outstanding before settlement is triggered. 1,000,000,000 = 1,000 USDC.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Protocol Fee (bps)</label>
                <input
                  type="number"
                  value={formData.feeBps}
                  onChange={e => setFormData({ ...formData, feeBps: e.target.value })}
                  className="input"
                />
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-3)' }}>100 bps = 1%</p>
              </div>
              <div>
                <label className="input-label">Risk Tier</label>
                <select
                  value={formData.riskTier}
                  onChange={e => setFormData({ ...formData, riskTier: e.target.value })}
                  className="input"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option value="1">1 — Low</option>
                  <option value="2">2 — Medium-Low</option>
                  <option value="3">3 — Medium</option>
                  <option value="4">4 — Medium-High</option>
                  <option value="5">5 — High</option>
                </select>
              </div>
            </div>

            <button onClick={handleRegister} disabled={isRegistering} className="btn btn-primary w-full">
              {isRegistering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Store className="w-3.5 h-3.5" />}
              {isRegistering ? 'Registering on-chain…' : 'Register Merchant'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Registered badge */}
          <div className="card-sm flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <div>
              <span className="text-sm font-medium text-white">Registered merchant</span>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                Your endpoint is live on the AeroPay network. Settlement address: {' '}
                <span className="mono">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-3">
            <div className="stat">
              <div className="flex items-center justify-between mb-3">
                <span className="stat-label">Total Revenue</span>
                <div className="icon-box"><DollarSign className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></div>
              </div>
              <div className="stat-value">
                ${stats?.totalRevenue ? (parseInt(stats.totalRevenue) / 1e6).toFixed(2) : '0.00'}
                <span className="text-sm font-normal ml-1 mono" style={{ color: 'var(--text-3)' }}>USDC</span>
              </div>
              <div className="stat-sub">Total settled revenue</div>
            </div>
            <div className="stat">
              <div className="flex items-center justify-between mb-3">
                <span className="stat-label">Transactions</span>
                <div className="icon-box"><TrendingUp className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></div>
              </div>
              <div className="stat-value">{stats?.transactionCount ?? 0}</div>
              <div className="stat-sub">Flash micropayments</div>
            </div>
            <div className="stat">
              <div className="flex items-center justify-between mb-3">
                <span className="stat-label">Customers</span>
                <div className="icon-box"><Users className="w-4 h-4" style={{ color: 'var(--text-3)' }} /></div>
              </div>
              <div className="stat-value">{stats?.uniqueUsers ?? 0}</div>
              <div className="stat-sub">Unique payer wallets</div>
            </div>
          </div>

          {/* Code snippet */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="section-title mb-0">Integration Snippet</div>
              <button onClick={handleCopy} className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <pre className="p-4 text-xs overflow-x-auto leading-relaxed" style={{ color: '#a3a3a3', fontFamily: 'JetBrains Mono, monospace' }}>
                <code>{sampleCode}</code>
              </pre>
            </div>
            <div className="card-sm flex items-center gap-2" style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Install:</span>
              <code className="text-xs mono" style={{ color: 'var(--text)' }}>npm install @flash-rail/merchant-middleware</code>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}