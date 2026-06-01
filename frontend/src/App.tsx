import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Zap, Home, Wallet, Store, Activity, BarChart3, Menu, X, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { WalletConnect } from './components/WalletConnet'
import HomePage from './pages/HomePage'
import UserDashboard from './pages/UserDashboard'
import MerchantPortal from './pages/MerchantPortal'
import Analytics from './pages/Analytics'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/user', label: 'Dashboard', icon: Wallet },
  { to: '/merchant', label: 'Merchant', icon: Store },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

function NavLink({ to, icon: Icon, children, onClick }: any) {
  const location = useLocation()
  const active = location.pathname === to

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[14.5px] transition-all font-medium ${
        active
          ? 'bg-[#1f1f1f] text-white border border-[#2a2a2a]'
          : 'text-[#737373] hover:text-[#e5e5e5] hover:bg-[#141414]'
      }`}
    >
      <Icon className="w-[17px] h-[17px] shrink-0" />
      <span>{children}</span>
    </Link>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top Nav */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(10,10,10,0.9)', borderColor: 'var(--border)', backdropFilter: 'blur(12px)' }}
      >
        <div className="max-w-6xl mx-auto px-5 h-[72px] flex items-center justify-between gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <span className="w-3 h-3 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="font-bold text-white text-[18px] tracking-tight">AeroPay</span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded"
              style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
            >
              TESTNET
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {NAV_ITEMS.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} icon={icon}>{label}</NavLink>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="http://localhost:5174"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-[13px] font-medium px-3.5 py-2 rounded-lg transition-all hover:text-white hover:bg-[#1c1c1c] hover:border-[#2b2b2b]"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
            >
              <span>Newsletter Demo</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <WalletConnect />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-1.5 rounded-lg"
              style={{ color: 'var(--text-2)', border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ to, label, icon }) => (
                <NavLink key={to} to={to} icon={icon} onClick={() => setMobileOpen(false)}>{label}</NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Page Content */}
      <main className="max-w-6xl mx-auto px-5 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t mt-20" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="text-sm font-semibold text-white">AeroPay</span>
            <span className="text-sm" style={{ color: 'var(--text-3)' }}>— Instant x402 on Base Sepolia</span>
          </div>
          <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--text-3)' }}>
            <a href="https://sepolia.base.org" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Base Network</a>
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/user" element={<UserDashboard />} />
        <Route path="/merchant" element={<MerchantPortal />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Layout>
  )
}