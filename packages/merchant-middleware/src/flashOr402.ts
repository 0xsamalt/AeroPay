import { Response, NextFunction } from 'express';
import { 
  FlashMiddlewareConfig, 
  FlashRequest, 
  FlashRouteHandler, 
  X402PaymentRequired 
} from './types';
import { parseFlashHeader, validateFlashPayment } from './validator';

/**
 * Creates Express middleware that handles Flash Rail payments or returns 402
 * 
 * @example
 * ```typescript
 * app.post('/api/ai-text', flashOr402({
 *   merchantAddress: '0x...',
 *   settlementAddress: '0x...',
 *   token: '0x...', // mUSDC address
 *   chainId: 25,
 *   price: '50000', // 0.05 USDC (6 decimals)
 *   gatewayUrl: 'https://gateway.example.com',
 *   description: 'AI Text Generation'
 * }, async (req, res) => {
 *   // This handler only runs if payment is valid
 *   const text = await generateAI(req.body.prompt);
 *   res.json({ text });
 * }));
 * ```
 */
export function flashOr402(
  config: FlashMiddlewareConfig,
  handler: FlashRouteHandler
) {
  return async (req: FlashRequest, res: Response, next: NextFunction) => {
    try {
      // Check if request has Flash payment header
      const flashHeader = req.headers['x-flash-payment'] as string | undefined;
      console.log(`[Flash Rail] Request headers:`, Object.keys(req.headers), 'x-flash-payment:', flashHeader ? 'present' : 'missing');

      if (flashHeader) {
        // Parse Flash payment
        const payment = parseFlashHeader(flashHeader);
        
        if (!payment) {
          return res.status(400).json({
            error: 'Invalid Flash payment header format'
          });
        }

        // Validate payment (unless in dev mode)
        if (!config.skipValidation) {
          const validation = await validateFlashPayment(
            payment,
            config.merchantAddress,
            config.price,
            config.token
          );

          if (!validation.valid) {
            console.error(`[Flash Rail] Payment rejected: ${validation.error}`);
            return res.status(402).json({
              error: 'Flash payment validation failed',
              reason: validation.error,
              ...buildPaymentRequired(config)
            });
          }
        }

        // Payment is valid! Attach to request and call handler
        req.flashPayment = payment;
        req.isPaidViaFlash = true;

        // Log successful Flash payment (merchant can track this)
        console.log(`[Flash Rail] Payment received: ${payment.user} -> ${config.merchantAddress} (${config.price} tokens)`);

        return handler(req, res);
      }

      // No Flash payment header - return 402 Payment Required
      return res.status(402).json(buildPaymentRequired(config));

    } catch (error) {
      console.error('[Flash Rail] Middleware error:', error);
      next(error);
    }
  };
}

/**
 * Builds x402 payment required response
 */
function buildPaymentRequired(config: FlashMiddlewareConfig): X402PaymentRequired {
  return {
    amount: config.price,
    token: config.token,
    recipient: config.settlementAddress,
    chainId: config.chainId,
    description: config.description || 'Payment required'
  };
}

/**
 * Simple middleware to check if request was paid via Flash
 * Useful for metrics/logging
 */
export function requireFlashPayment(
  req: FlashRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.isPaidViaFlash) {
    return res.status(402).json({
      error: 'Flash payment required',
      message: 'This endpoint only accepts Flash Rail payments'
    });
  }
  next();
}

/**
 * Utility to extract user address from Flash payment
 */
export function getFlashUser(req: FlashRequest): string | null {
  return req.flashPayment?.user || null;
}

/**
 * Utility to check if request was paid via Flash
 */
export function isPaidViaFlash(req: FlashRequest): boolean {
  return req.isPaidViaFlash === true;
}