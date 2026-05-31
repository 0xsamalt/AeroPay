/**
 * @flash-rail/merchant-middleware
 * 
 * Express middleware for accepting Flash Credit Rail payments on Cronos x402
 * 
 * @example
 * ```typescript
 * import { flashOr402 } from '@flash-rail/merchant-middleware';
 * 
 * app.post('/api/service', flashOr402({
 *   merchantAddress: '0x...',
 *   settlementAddress: '0x...',
 *   token: '0x...', // mUSDC
 *   chainId: 25,
 *   price: '50000',
 *   gatewayUrl: 'https://gateway.example.com'
 * }, async (req, res) => {
 *   // Only runs if payment is valid
 *   res.json({ data: 'your response' });
 * }));
 * ```
 */

export { 
  flashOr402, 
  requireFlashPayment, 
  getFlashUser, 
  isPaidViaFlash 
} from './flashOr402';

export { 
  validateFlashPayment, 
  parseFlashHeader 
} from './validator';

export type { 
  FlashMiddlewareConfig,
  FlashPaymentHeader,
  FlashRequest,
  FlashRouteHandler,
  X402PaymentRequired 
} from './types';