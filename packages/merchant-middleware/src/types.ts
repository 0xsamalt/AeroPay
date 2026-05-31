import { Request, Response, NextFunction } from 'express';

/**
 * Flash payment header structure
 */
export interface FlashPaymentHeader {
  user: string;           // User's wallet address
  merchant: string;       // Merchant's address
  amount: string;         // Payment amount in token units
  token: string;          // Token address (e.g., mUSDC)
  nonce: string;          // User's nonce
  deadline: string;       // Signature expiration timestamp
  signature: string;      // EIP-712 signature (v,r,s combined)
  gatewayUrl: string;     // Gateway URL for verification
}

/**
 * x402 payment requirements response
 */
export interface X402PaymentRequired {
  amount: string;         // Amount required (in token units, e.g., "50000" for 0.05 USDC)
  token: string;          // Token contract address
  recipient: string;      // Merchant's settlement address
  chainId: number;        // Cronos chain ID (25 or 388)
  description?: string;   // Optional description of the service
}

/**
 * Middleware configuration
 */
export interface FlashMiddlewareConfig {
  merchantAddress: string;     // This merchant's address (registered in MerchantRegistry)
  settlementAddress: string;   // Where to receive payments
  token: string;               // Token to accept (e.g., mUSDC address)
  chainId: number;             // Cronos chain ID (25 for EVM, 388 for zkEVM)
  price: string;               // Price per request in token units
  gatewayUrl: string;          // Flash Gateway URL for validation
  description?: string;        // Service description
  skipValidation?: boolean;    // Skip signature validation (dev mode only)
}

/**
 * Extended Express Request with Flash payment data
 */
export interface FlashRequest extends Request {
  flashPayment?: FlashPaymentHeader;
  isPaidViaFlash?: boolean;
}

/**
 * Middleware handler type
 */
export type FlashMiddleware = (
  req: FlashRequest,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

/**
 * Route handler type
 */
export type FlashRouteHandler = (
  req: FlashRequest,
  res: Response
) => Promise<void> | void;