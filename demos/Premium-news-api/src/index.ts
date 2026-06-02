// @ts-nocheck
import express from 'express';
import cors from 'cors';
import { flashOr402, getFlashUser, isPaidViaFlash } from '@flash-rail/merchant-middleware';

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

const MERCHANT_CONFIG = {
  merchantAddress: '0xBf150DFD114350F37f5967cA859Fb0366133CABf',
  settlementAddress: '0xBf150DFD114350F37f5967cA859Fb0366133CABf',
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia
  chainId: 84532,
  price: 100000, // 0.10 USDC (6 decimals)
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3000',
  description: 'Premium News Article Access',
};

// Premium article content database
const ARTICLES: Record<string, { title: string; content: string; author: string }> = {
  'market-analysis': {
    title: 'Market Analysis: The Rise of x402 Protocols',
    author: 'Vitalik Buterin',
    content: `The x402 payment standard represents one of the most compelling developments in decentralized finance infrastructure. Unlike traditional ERC-20 token transfers that require on-chain gas and block confirmation, x402 leverages off-chain cryptographic vouchers signed by the payer's wallet.

The key insight: a merchant doesn't need to wait for a blockchain confirmation to trust a payment. They need to verify that (1) the user has sufficient funds locked in a credit vault, and (2) the signature is valid. These two operations can happen in milliseconds on a local server.

Base Sepolia's sub-second finality makes settlement batching extremely efficient. A gateway aggregates 100 micropayments, then submits a single on-chain batch settlement, reducing gas costs by up to 97%. This is how AeroPay achieves ~230ms average payment latency versus 3-5 seconds for standard ERC-20 transfers.

Industry adoption is accelerating. LLM API providers, streaming platforms, and data feeds are the first movers — they have the highest volume of micro-transactions where per-request billing makes economic sense.`,
  },
  'vulnerabilities': {
    title: 'Bypassing Subscription Paywalls Safely with AeroPay',
    author: 'Satoshi Nakamoto',
    content: `The traditional monthly SaaS subscription model creates a fundamental mismatch between value delivery and value capture. A user who reads 3 articles per month pays the same as someone who reads 300. This forces platforms to optimize for volume, not quality.

Pay-per-request micropayments with AeroPay introduce a new economic primitive: atomic, instant, and revocable access grants. Each request is its own economic unit. Pricing becomes granular — an article costs $0.10, a research report costs $2.50, a real-time data feed costs $0.001 per query.

Session keys are the critical UX innovation that makes this seamless. A user authorizes a spending limit once (e.g., $5 USDC for 30 days), and all subsequent micro-payments within that limit are signed silently by an ephemeral key stored in the browser. No wallet popups, no friction — just instant access.

For content creators, this means every piece of work generates direct, proportional revenue. For consumers, it means paying only for what you actually consume. The economic alignment is perfect, and it's finally technically feasible on Layer-2 rollups like Base.`,
  },
};

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Premium News API', port: PORT }));

// Protected Article Endpoint
app.get('/api/article/:id', flashOr402(MERCHANT_CONFIG, async (req, res) => {
  const { id } = req.params;
  const user = getFlashUser(req);
  const method = isPaidViaFlash(req) ? 'FLASH' : 'ONCHAIN';

  const article = ARTICLES[id];

  if (!article) {
    return res.status(404).json({ error: `Article '${id}' not found`, available: Object.keys(ARTICLES) });
  }

  console.log(`[NEWS] Article '${id}' unlocked for ${user?.slice(0, 8) ?? 'anon'}... via ${method}`);

  res.json({
    id,
    title: article.title,
    content: article.content,
    author: article.author,
    access_granted: true,
    method,
    metadata: { user, timestamp: new Date().toISOString() }
  });
}));

app.listen(PORT, () => {
  console.log(`📰 Premium News API running on http://localhost:${PORT} | Price: 0.10 USDC per article`);
});