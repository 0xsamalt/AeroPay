import { useState, useEffect } from 'react'
import { WagmiProvider, useAccount, useReadContract, useWalletClient, usePublicClient } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import { Zap, Key, ShieldCheck, Clock, Lock, BookOpen, User, RefreshCw, ChevronRight, Newspaper, AlertTriangle } from 'lucide-react'
import { wagmiConfig } from './wagmi'
import { config } from './config'
import { useSessionKey, SessionKeySigner } from './hooks/useSessionKey'
import { FlashRailClient, Signer } from '@flash-rail/client-sdk'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

const VAULT_BALANCE_ABI = [
  {
    name: 'totalDeposited',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'reserved',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// Custom Signer for standard wallet client (requires popup)
class WagmiSigner implements Signer {
  private address: string
  private walletClient: any

  constructor(address: string, walletClient: any) {
    this.address = address
    this.walletClient = walletClient
  }

  async getAddress(): Promise<string> {
    return this.address
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    return this.walletClient.signTypedData({
      account: this.address as `0x${string}`,
      domain,
      types,
      primaryType: 'FlashAuth',
      message: value,
    })
  }
}

interface Article {
  id: string
  title: string
  snippet: string
  price: string // in USDC
  isPaid: boolean
  content?: string
  author: string
  readTime: string
  category: string
}

function NewsletterDashboard() {
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const [articles, setArticles] = useState<Article[]>([
    {
      id: 'free-1',
      title: 'The Future of Decentralized Web Payments',
      snippet: 'Traditional credit card rails are expensive and slow. How Web3 and Layer-2 rollups like Base are introducing instant, trustless micro-settlements for APIs.',
      price: '0.00',
      isPaid: false,
      author: 'Sarah Jenkins',
      readTime: '3 min read',
      category: 'Web3 Technology',
      content: 'This is the full text of the free article. In a decentralized web, protocols like x402 enable machines and users to perform sub-cent payments for API calls and media streaming. Traditional payment gateways charge flat fees (like $0.30) that make micropayments impossible. Settle in batches on Base Sepolia instead and bypass those fees completely!'
    },
    {
      id: 'market-analysis',
      title: 'Market Analysis: The Rise of x402 Protocols',
      snippet: 'An in-depth look at how the x402 payment standard operates off-chain using cryptographic micro-vouchers and settles on-chain dynamically.',
      price: '0.10',
      isPaid: true,
      author: 'Vitalik Buterin',
      readTime: '8 min read',
      category: 'Finance',
    },
    {
      id: 'vulnerabilities',
      title: 'Bypassing Subscription Paywalls Safely with AeroPay',
      snippet: 'Why the traditional monthly SaaS subscription model is broken, and how pay-per-request micropayments offer a fairer monetization model for content creators.',
      price: '0.10',
      isPaid: true,
      author: 'Satoshi Nakamoto',
      readTime: '5 min read',
      category: 'SaaS Design',
    }
  ])

  const [unlockedArticles, setUnlockedArticles] = useState<Record<string, { title: string; content: string; method: string; latency: number }>>({})
  const [activeArticleId, setActiveArticleId] = useState<string>('free-1')
  const [unlockLoading, setUnlockLoading] = useState<string | null>(null)
  
  // Session key hook
  const session = useSessionKey()

  // Session key configuration inputs
  const [sessionLimitInput, setSessionLimitInput] = useState('2.0')
  const [sessionExpiryDays, setSessionExpiryDays] = useState(7)

  // Read balance from vault
  const { data: totalDeposited, refetch: refetchTotal } = useReadContract({
    address: config.contracts.vault as `0x${string}`,
    abi: VAULT_BALANCE_ABI,
    functionName: 'totalDeposited',
    args: address ? [address as `0x${string}`, config.contracts.USDC as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const { data: reservedAmount, refetch: refetchReserved } = useReadContract({
    address: config.contracts.vault as `0x${string}`,
    abi: VAULT_BALANCE_ABI,
    functionName: 'reserved',
    args: address ? [address as `0x${string}`, config.contracts.USDC as `0x${string}`] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const availableBalance =
    totalDeposited !== undefined && reservedAmount !== undefined
      ? (totalDeposited as bigint) - (reservedAmount as bigint)
      : 0n

  const refreshBalance = async () => {
    await Promise.all([
      refetchTotal(),
      refetchReserved(),
      session.refetchSessionState()
    ])
  }

  useEffect(() => {
    if (address) {
      refreshBalance()
    }
  }, [address])

  const handleUnlockArticle = async (article: Article) => {
    if (!address) {
      alert('Please connect your wallet first')
      return
    }

    setUnlockLoading(article.id)
    const startTime = Date.now()

    try {
      let activeSigner: Signer

      if (session.isActive && session.getClientSigner()) {
        // Mode 1: Ephemeral session key signature (silent, no popup)
        activeSigner = session.getClientSigner()!
        console.log('Unlocking article silently via Session Key...')
      } else {
        // Mode 2: Standard Wallet signature (prompting popup)
        if (!walletClient) throw new Error('Wallet client not loaded. Re-connect.')
        activeSigner = new WagmiSigner(address, walletClient)
        console.log('Unlocking article via Wallet Signature Popup...')
      }

      // Initialize FlashRailClient
      const client = new FlashRailClient({
        gatewayUrl: config.gatewayUrl,
        signer: activeSigner,
        chainId: config.base.chainId,
        vaultAddress: config.contracts.vault,
        autoRetry: true
      })

      // Fetch the protected article endpoint on port 3002
      // Using client.fetch will automatically intercept 402, check eligibility,
      // request the signature (silently or via popup), and retry with flash payment headers!
      const url = `${config.newsApiUrl}/api/article/${article.id}`
      const response = await client.fetch(url)

      if (!response.ok) {
        throw new Error(response.data?.reason || 'Failed to unlock article')
      }

      const latency = Date.now() - startTime
      console.log(`Unlocked successfully in ${latency}ms!`)

      setUnlockedArticles(prev => ({
        ...prev,
        [article.id]: {
          title: response.data.title,
          content: response.data.content,
          method: response.method, // 'FLASH' or 'FREE'
          latency
        }
      }))

      setActiveArticleId(article.id)
      await refreshBalance()
    } catch (err: any) {
      console.error(err)
      alert(`❌ Unlock failed: ${err.message || err}`)
    } finally {
      setUnlockLoading(null)
    }
  }

  const handleSetupSession = async () => {
    try {
      const pubKey = await session.authorizeSession(sessionLimitInput, sessionExpiryDays)
      alert(`✅ Session authorized on-chain! Silent payment enabled.\nKey: ${pubKey}`)
      await refreshBalance()
    } catch (err: any) {
      alert(`❌ Session setup failed: ${err.message || err}`)
    }
  }

  const handleRevokeSession = async () => {
    try {
      await session.revokeSession()
      alert('✅ Session revoked on-chain.')
      await refreshBalance()
    } catch (err: any) {
      alert(`❌ Session revocation failed: ${err.message || err}`)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Decorative Glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-orange-500/5 to-purple-600/5 rounded-full blur-3xl pointer-events-none -z-10"></div>
      
      {/* Header */}
      <header className="border-b border-white/5 bg-zinc-900/40 backdrop-blur-xl sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Newspaper className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white">THE DAILY FLASH</span>
              <span className="text-[10px] text-zinc-500 block font-mono">Silent Micropayment Demo Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ConnectButton showBalance={false} />
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
        
        {/* Left Side: Session Control Panel */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Vault Balance Card */}
          <div className="rounded-2xl bg-zinc-900/30 border border-white/5 p-6 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-orange-500 to-red-500"></div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Credit Vault Balance</span>
              <button 
                onClick={refreshBalance} 
                className="p-1 rounded bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            {isConnected ? (
              <div>
                <div className="text-3xl font-mono font-bold text-white">
                  {totalDeposited !== undefined ? parseFloat(formatUnits(availableBalance, 6)).toFixed(2) : '0.00'}
                  <span className="text-base text-zinc-500 font-sans ml-1.5">USDC</span>
                </div>
                <div className="text-xs text-zinc-500 font-light mt-1.5">
                  Locked in FlashCreditVault on Base Sepolia
                </div>
                {availableBalance === 0n && (
                  <div className="mt-4 p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 text-[11px] text-orange-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Your credit vault is empty. Please visit the <a href="http://localhost:5173/user" target="_blank" rel="noopener noreferrer" className="underline font-bold text-white hover:text-orange-300">AeroPay Main Portal</a> to deposit testnet USDC collateral.</span>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-sm text-zinc-500 italic font-light">Connect wallet to view vault balance</span>
            )}
          </div>

          {/* Session Key Config Card */}
          <div className="rounded-2xl bg-zinc-900/30 border border-white/5 p-6 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <Key className="w-4.5 h-4.5 text-orange-400 animate-pulse" />
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">Session Key Auth</h3>
              </div>
              {session.isActive ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3" />
                  <span>ACTIVE</span>
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded font-medium">INACTIVE</span>
              )}
            </div>

            {!isConnected ? (
              <p className="text-zinc-500 text-xs font-light italic">Connect wallet to authorize session key</p>
            ) : session.isActive ? (
              <div className="space-y-4">
                <div className="text-[11px] text-zinc-400 leading-normal">
                  Silent payments are **enabled**! Clicking paid articles will sign messages locally without requesting wallet signature popups.
                </div>
                
                <div className="bg-zinc-950/60 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Key Address:</span>
                    <span className="font-mono text-zinc-300">{session.sessionAddress?.slice(0,6)}...{session.sessionAddress?.slice(-4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Limit Approved:</span>
                    <span className="font-mono text-zinc-300 font-bold">{parseFloat(formatUnits(session.onChainLimit, 6)).toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Spent Total:</span>
                    <span className="font-mono text-zinc-300">{parseFloat(formatUnits(session.onChainSpent, 6)).toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Expires In:</span>
                    <span className="text-zinc-300">
                      {new Date(Number(session.onChainExpiry) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRevokeSession}
                  disabled={session.isRevoking}
                  className="w-full py-2.5 rounded-xl bg-red-950/20 hover:bg-red-900/20 border border-red-500/20 hover:border-red-500/40 text-red-300 font-semibold transition active:scale-95 text-xs flex justify-center items-center gap-1.5"
                >
                  {session.isRevoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Revoke Session Key</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-zinc-400 leading-normal font-light">
                  No active session key. Every purchase will request a standard MetaMask/WalletConnect signature prompt. Authorize a session key to bypass:
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-light block mb-1">Session Spend Limit (USDC)</label>
                    <input
                      type="number"
                      value={sessionLimitInput}
                      onChange={(e) => setSessionLimitInput(e.target.value)}
                      placeholder="2.0"
                      className="w-full bg-zinc-950/60 border border-white/5 focus:border-orange-500/30 focus:ring-0 rounded-xl px-3 py-2 text-white font-mono text-xs transition"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-light block mb-1">Valid Days</label>
                    <select
                      value={sessionExpiryDays}
                      onChange={(e) => setSessionExpiryDays(Number(e.target.value))}
                      className="w-full bg-zinc-950/60 border border-white/5 focus:border-orange-500/30 focus:ring-0 rounded-xl px-3 py-2 text-white text-xs transition"
                    >
                      <option value={1}>1 Day</option>
                      <option value={7}>7 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSetupSession}
                  disabled={session.isAuthorizing || !sessionLimitInput}
                  className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition active:scale-95 text-xs flex justify-center items-center gap-1.5"
                >
                  {session.isAuthorizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Authorize Session Key</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Newsletter Feed & Article Display */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Feed Header */}
          <div className="flex items-center gap-2 text-zinc-400 text-sm font-semibold tracking-wider border-b border-white/5 pb-2">
            <BookOpen className="w-4 h-4 text-orange-400" />
            <span>TODAY'S ISSUES</span>
          </div>

          <div className="space-y-6">
            {articles.map((art) => {
              const isUnlocked = unlockedArticles[art.id] !== undefined || !art.isPaid
              const detail = unlockedArticles[art.id]

              return (
                <div 
                  key={art.id} 
                  className={`rounded-2xl bg-zinc-900/10 border p-6 transition-all duration-200 ${
                    activeArticleId === art.id 
                      ? 'border-orange-500/30 bg-zinc-900/20' 
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-full">
                      {art.category}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 font-light">
                      <span>{art.author}</span>
                      <span>•</span>
                      <span>{art.readTime}</span>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">{art.title}</h3>

                  {isUnlocked ? (
                    <div className="space-y-4">
                      <p className="text-zinc-300 text-sm leading-relaxed font-sans">
                        {art.id === 'free-1' ? art.content : detail?.content}
                      </p>
                      {art.isPaid && detail && (
                        <div className="text-[10px] text-zinc-500 font-mono bg-zinc-950/60 p-3 rounded-lg border border-white/5 flex justify-between items-center">
                          <span>Paywall Unlocked via Flash ({detail.latency}ms)</span>
                          <span className="text-emerald-400 font-semibold">{session.isActive ? '⚡ Silent session signature' : '👤 Manual signature popup'}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-zinc-500 text-sm leading-relaxed font-light mb-4">
                        {art.snippet}
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-4 bg-zinc-950/60 border border-white/5 rounded-xl p-4 justify-between">
                        <div className="flex items-center gap-2">
                          <Lock className="w-4 h-4 text-orange-400" />
                          <span className="text-xs text-zinc-400 font-light">Price to unlock: <strong className="text-white font-mono font-bold">{art.price} USDC</strong></span>
                        </div>
                        <button
                          onClick={() => handleUnlockArticle(art)}
                          disabled={unlockLoading !== null}
                          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 text-white font-bold transition text-xs flex items-center justify-center gap-2"
                        >
                          {unlockLoading === art.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Paying...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 text-white" />
                              <span>Unlock Instantly</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {isUnlocked && activeArticleId !== art.id && (
                    <button 
                      onClick={() => setActiveArticleId(art.id)}
                      className="mt-3 text-xs text-zinc-400 hover:text-white font-medium flex items-center gap-1"
                    >
                      <span>Show Full Article</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

        </div>

      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 bg-zinc-900/10 backdrop-blur mt-16 text-center text-xs text-zinc-500">
        <p>© 2026 The Daily Flash. Enabled by AeroPay Smart Session Keys ⚡</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">
          <NewsletterDashboard />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
