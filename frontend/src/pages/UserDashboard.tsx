import { useState, useEffect } from 'react'
import {
  useAccount,
  useWriteContract,
  useReadContract,
  useWalletClient,
  usePublicClient,
} from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  CheckCircle2,
  Key,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Calendar,
  DollarSign,
} from 'lucide-react'
import { config } from '../config'
import { useSessionKey } from '../hooks/useSessionKey'

type UserTx = { type: string; timestamp: number; amount: string; merchant: string }

const VAULT_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'totalDeposited', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'reserved', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

function BalanceStat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: any }) {
  return (
    <div className="stat">
      <div className="flex items-center justify-between mb-3">
        <span className="stat-label">{label}</span>
        <div className="icon-box">
          <Icon className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
        </div>
      </div>
      <div className="stat-value">
        {value}
        <span className="text-sm font-normal ml-1.5 mono" style={{ color: 'var(--text-3)' }}>USDC</span>
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, extra }: any) {
  return (
    <div>
      <label className="input-label">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="input pr-14"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>
          USDC
        </span>
      </div>
      {extra && <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{extra}</p>}
    </div>
  )
}

export default function UserDashboard() {
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [txHistory, setTxHistory] = useState<UserTx[]>([])
  const [isDepositing, setIsDepositing] = useState(false)
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [sessionLimitInput, setSessionLimitInput] = useState('5.0')
  const [sessionExpiryDays, setSessionExpiryDays] = useState(7)

  const session = useSessionKey()

  const { data: vaultBalance, refetch: refetchVault } = useReadContract({
    address: config.contracts.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'totalDeposited',
    args: address ? [address as `0x${string}`, config.contracts.USDC as `0x${string}`] : undefined,
    query: { enabled: !!address },
  })

  const { data: reservedBalance, refetch: refetchReserved } = useReadContract({
    address: config.contracts.vault as `0x${string}`,
    abi: VAULT_ABI,
    functionName: 'reserved',
    args: address ? [address as `0x${string}`, config.contracts.USDC as `0x${string}`] : undefined,
    query: { enabled: !!address },
  })

  const availableBalance =
    vaultBalance !== undefined && reservedBalance !== undefined
      ? (vaultBalance as bigint) - (reservedBalance as bigint)
      : 0n

  const { data: tokenBalance, refetch: refetchToken } = useReadContract({
    address: config.contracts.USDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address },
  })

  const fetchHistory = async () => {
    if (!address) return
    try {
      const res = await fetch(`${config.gatewayUrl}/api/user/${address}/transactions`)
      const data = await res.json()
      setTxHistory(Array.isArray(data) ? data : [])
    } catch { setTxHistory([]) }
  }

  const triggerRefetch = async () => {
    await Promise.all([refetchVault(), refetchReserved(), refetchToken(), fetchHistory(), session.refetchSessionState()])
  }

  useEffect(() => { if (address) triggerRefetch() }, [address])

  const handleDeposit = async () => {
    if (!depositAmount || !walletClient || !publicClient || !address) return
    setIsDepositing(true)
    try {
      const amountWei = parseUnits(depositAmount, 6)
      const approveTx = await writeContractAsync({ address: config.contracts.USDC as `0x${string}`, abi: ERC20_ABI, functionName: 'approve', args: [config.contracts.vault as `0x${string}`, amountWei] })
      await publicClient.waitForTransactionReceipt({ hash: approveTx })
      const depositTx = await writeContractAsync({ address: config.contracts.vault as `0x${string}`, abi: VAULT_ABI, functionName: 'deposit', args: [config.contracts.USDC as `0x${string}`, amountWei] })
      await publicClient.waitForTransactionReceipt({ hash: depositTx })
      await triggerRefetch()
      setDepositAmount('')
      alert(`✅ Deposited ${depositAmount} USDC into vault.`)
    } catch (err: any) {
      alert(`❌ Deposit failed: ${err.message || err}`)
    } finally { setIsDepositing(false) }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || !walletClient || !publicClient || !address) return
    setIsWithdrawing(true)
    try {
      const amountWei = parseUnits(withdrawAmount, 6)
      const tx = await writeContractAsync({ address: config.contracts.vault as `0x${string}`, abi: VAULT_ABI, functionName: 'withdraw', args: [config.contracts.USDC as `0x${string}`, amountWei] })
      await publicClient.waitForTransactionReceipt({ hash: tx })
      await triggerRefetch()
      setWithdrawAmount('')
      alert(`✅ Withdrew ${withdrawAmount} USDC from vault.`)
    } catch (err: any) {
      alert(`❌ Withdrawal failed: ${err.message || err}`)
    } finally { setIsWithdrawing(false) }
  }

  const handleCreateSession = async () => {
    if (!sessionLimitInput) return
    try {
      const key = await session.authorizeSession(sessionLimitInput, sessionExpiryDays)
      alert(`✅ Session key authorized.\nAddress: ${key}`)
    } catch (err: any) { alert(`❌ ${err.message || err}`) }
  }

  const handleRevokeSession = async () => {
    try {
      await session.revokeSession()
      alert('✅ Session key revoked.')
    } catch (err: any) { alert(`❌ ${err.message || err}`) }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="icon-box w-12 h-12 mb-5">
          <Wallet className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Connect your wallet</h2>
        <p className="text-sm max-w-xs" style={{ color: 'var(--text-2)' }}>
          Manage vault balance, deposit USDC collateral, and authorize session keys for silent payments.
        </p>
      </div>
    )
  }

  const fmt = (v: bigint) => parseFloat(formatUnits(v, 6)).toFixed(2)

  return (
    <div className="space-y-8 pb-20">

      {/* Header */}
      <div className="page-header flex-row items-center justify-between gap-4">
        <div>
          <div className="page-eyebrow">
            <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
            Credit Vault
          </div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-desc">Manage your USDC collateral and session key authorization.</p>
        </div>
        <button onClick={triggerRefetch} className="btn btn-ghost shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Balance row */}
      <div className="grid md:grid-cols-3 gap-3">
        <BalanceStat
          label="Available Credit"
          value={vaultBalance !== undefined ? fmt(availableBalance) : '0.00'}
          sub="Ready for instant payments"
          icon={Zap}
        />
        <BalanceStat
          label="Total Deposited"
          value={vaultBalance ? fmt(vaultBalance as bigint) : '0.00'}
          sub={reservedBalance && (reservedBalance as bigint) > 0n ? `${fmt(reservedBalance as bigint)} USDC reserved` : 'No active reservations'}
          icon={Wallet}
        />
        <BalanceStat
          label="Wallet Balance"
          value={tokenBalance ? fmt(tokenBalance as bigint) : '0.00'}
          sub="Base Sepolia USDC"
          icon={DollarSign}
        />
      </div>

      {/* Deposit / Withdraw */}
      <div className="grid lg:grid-cols-2 gap-4">

        <div className="card space-y-4">
          <div className="section-title">
            <ArrowDownCircle className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            Deposit Collateral
          </div>
          <InputField
            label="Amount"
            value={depositAmount}
            onChange={setDepositAmount}
            placeholder="5.00"
            extra="Requires two wallet approvals — first to approve USDC, then to deposit."
          />
          <button onClick={handleDeposit} disabled={isDepositing || !depositAmount} className="btn btn-primary w-full">
            {isDepositing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {isDepositing ? 'Confirming…' : 'Deposit to Vault'}
          </button>
        </div>

        <div className="card space-y-4">
          <div className="section-title">
            <ArrowUpCircle className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
            Withdraw Funds
          </div>
          <InputField
            label="Amount"
            value={withdrawAmount}
            onChange={setWithdrawAmount}
            placeholder="2.00"
            extra="Only unreserved USDC can be withdrawn from the vault."
          />
          <button onClick={handleWithdraw} disabled={isWithdrawing || !withdrawAmount} className="btn btn-secondary w-full">
            {isWithdrawing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {isWithdrawing ? 'Withdrawing…' : 'Withdraw from Vault'}
          </button>
        </div>

      </div>

      {/* Session Key */}
      <div className="card space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="icon-box">
              <Key className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div className="font-semibold text-white">Session Key</div>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>Silent payments — no wallet popup on each request</p>
            </div>
          </div>
          {session.isActive ? (
            <span className="badge badge-green"><ShieldCheck className="w-3 h-3" /> Active</span>
          ) : (
            <span className="badge badge-neutral">Inactive</span>
          )}
        </div>

        <hr className="divider" />

        {session.isActive ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="card-sm">
                <div className="stat-label mb-1">Key Address</div>
                <span className="mono text-xs text-white break-all">{session.sessionAddress}</span>
              </div>
              <div className="card-sm">
                <div className="stat-label mb-2">Spend Progress</div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="mono text-sm font-semibold text-white">
                    {fmt(session.onChainSpent)} / {fmt(session.onChainLimit)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>USDC</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${session.onChainLimit > 0n ? Math.min(100, Number((session.onChainSpent * 100n) / session.onChainLimit)) : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="card-sm flex items-center gap-3">
              <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--text-3)' }} />
              <div>
                <div className="stat-label">Expires</div>
                <span className="text-sm text-white">{new Date(Number(session.onChainExpiry) * 1000).toLocaleString()}</span>
              </div>
              {session.isExpired && <span className="badge badge-red ml-auto">Expired</span>}
            </div>

            <button onClick={handleRevokeSession} disabled={session.isRevoking} className="btn btn-danger w-full">
              {session.isRevoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {session.isRevoking ? 'Revoking…' : 'Revoke Session Key'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
              Generate a temporary key in browser storage. Authorize it once on-chain with a spending cap — subsequent payments sign silently.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="input-label">Spend Limit</label>
                <div className="relative">
                  <input
                    type="number"
                    value={sessionLimitInput}
                    onChange={e => setSessionLimitInput(e.target.value)}
                    placeholder="5.00"
                    className="input pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: 'var(--text-3)' }}>USDC</span>
                </div>
              </div>
              <div>
                <label className="input-label">Duration</label>
                <select
                  value={sessionExpiryDays}
                  onChange={e => setSessionExpiryDays(Number(e.target.value))}
                  className="input"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                  <option value={30}>30 Days</option>
                </select>
              </div>
            </div>
            <button onClick={handleCreateSession} disabled={session.isAuthorizing || !sessionLimitInput} className="btn btn-primary w-full">
              {session.isAuthorizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
              {session.isAuthorizing ? 'Authorizing on-chain…' : 'Authorize Session Key'}
            </button>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="card">
        <div className="section-title">
          <Activity className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          Transaction History
        </div>

        {txHistory.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--border-2)' }} />
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No transactions processed yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Payments will appear here after your first AeroPay transaction.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Merchant</th>
                  <th>Time</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {txHistory.map((tx, i) => (
                  <tr key={i}>
                    <td>
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        <span className="text-white font-medium">{tx.type}</span>
                      </span>
                    </td>
                    <td className="mono">{tx.merchant.slice(0, 8)}…{tx.merchant.slice(-6)}</td>
                    <td>{new Date(tx.timestamp * 1000).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>
                        {parseFloat(formatUnits(BigInt(tx.amount), 6)).toFixed(2)} USDC
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
