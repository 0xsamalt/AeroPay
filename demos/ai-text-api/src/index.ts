// @ts-nocheck
import express from 'express';
import cors from 'cors';
import { flashOr402, getFlashUser, isPaidViaFlash } from '@flash-rail/merchant-middleware';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const MERCHANT_CONFIG = {
  merchantAddress: '0xBf150DFD114350F37f5967cA859Fb0366133CABf',
  settlementAddress: '0xBf150DFD114350F37f5967cA859Fb0366133CABf',
  token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC Base Sepolia (6 decimals)
  chainId: 84532, // Base Sepolia
  price: 50000, // 0.05 USDC (6 decimals, BigInt)
  gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3000',
  description: 'AI Text Generation API',
  skipValidation: false
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'AI Text API',
    price: MERCHANT_CONFIG.price,
    token: MERCHANT_CONFIG.token
  });
});

// Protected AI text generation endpoint
app.post('/api/ai-text', flashOr402(MERCHANT_CONFIG, async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Log payment info
  const user = getFlashUser(req);
  const paymentMethod = isPaidViaFlash(req) ? 'FLASH' : 'ONCHAIN';
  
  console.log(`[${new Date().toISOString()}] Request from ${user} via ${paymentMethod}`);

  // Simulate AI text generation
  const mockAIResponse = generateMockAI(prompt);

  res.json({
    text: mockAIResponse,
    metadata: {
      user,
      paymentMethod,
      prompt: prompt.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    }
  });
}));

// Another protected endpoint - image generation
app.post('/api/ai-image', flashOr402({
  ...MERCHANT_CONFIG,
  price: '100000', // 0.10 USDC - more expensive
  description: 'AI Image Generation API'
}, async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const user = getFlashUser(req);
  console.log(`[IMAGE] Request from ${user}: ${prompt}`);

  res.json({
    imageUrl: `https://picsum.photos/512?random=${Date.now()}`,
    prompt,
    user,
    paymentMethod: 'FLASH'
  });
}));

// Test endpoint - no payment required
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'This endpoint is free!',
    timestamp: new Date().toISOString()
  });
});

// Mock AI function (replace with real AI API)
function generateMockAI(prompt: string): string {
  const responses = [
    `Here's a response to "${prompt}": This is a simulated AI-generated text. In production, this would call a real AI model like GPT or Claude.`,
    `Based on your prompt "${prompt}", I can tell you that this is a demo response. The Flash Rail payment system is working correctly!`,
    `Processing "${prompt}"... This is a mock AI response. Your payment via Flash Rail was instant and secure!`
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  🤖 AI Text API (Demo Merchant)                           ║
║                                                            ║
║  Server running on: http://localhost:${PORT}               ║
║                                                            ║
║  Endpoints:                                                ║
║  • GET  /health           - Health check                   ║
║  • GET  /api/test         - Free test endpoint             ║
║  • POST /api/ai-text      - AI text (0.05 USDC)            ║
║  • POST /api/ai-image     - AI image (0.10 USDC)           ║
║                                                            ║
║  Mode: ${process.env.NODE_ENV === 'development' ? 'DEVELOPMENT (validation skipped)' : 'PRODUCTION'}          ║
╚════════════════════════════════════════════════════════════╝
  `);
});