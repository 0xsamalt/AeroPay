/**
 * Flash Rail Client SDK Types
 */

/**
 * Signer interface - compatible with ethers.js Signer
 */
export interface Signer {
  getAddress(): Promise<string>;
  signTypedData(
    domain: any,
    types: any,
    value: any
  ): Promise<string>;
}

/**
 * Flash fetch configuration
 */
export interface FlashFetchConfig {
  gatewayUrl: string;        // Flash Gateway URL
  signer: Signer;            // Wallet signer (ethers.js)
  chainId: number;           // Base chain ID 
  vaultAddress: string;      // FlashCreditVault contract address
  autoRetry?: boolean;       // Auto-retry with Flash on 402 (default: true)
  timeout?: number;          // Request timeout in ms (default: 30000)
}

/**
 * Flash fetch options (extends standard fetch options)
 */
export interface FlashFetchOptions extends RequestInit {
  // Standard fetch options: method, headers, body, etc.
}

/**
 * Flash fetch response
 */
export interface FlashFetchResponse<T = any> {
  data: T;                   // Response data
  ok: boolean;               // Request succeeded
  status: number;            // HTTP status code
  method: PaymentMethod;     // How payment was made
  latency: number;           // Request latency in ms
  paymentDetails?: PaymentDetails; // Payment info if applicable
}

/**
 * Payment method used
 */
export type PaymentMethod = 'FLASH' | 'ONCHAIN' | 'FREE' | 'FAILED';

/**
 * Payment details
 */
export interface PaymentDetails {
  amount: string;            // Amount paid
  token: string;             // Token address
  merchant: string;          // Merchant address
  user: string;              // User address
  nonce: string;             // Nonce used
  signature?: string;        // Signature if Flash
}

/**
 * x402 Payment required response
 */
export interface X402Response {
  amount: string;
  token: string;
  recipient: string;
  chainId: number;
  description?: string;
}

/**
 * Flash authorization payload (EIP-712)
 */
export interface FlashAuthPayload {
  user: string;
  merchant: string;
  amount: string;
  token: string;
  nonce: string;
  deadline: string;
}

/**
 * Flash authorization with signature
 */
export interface FlashAuth extends FlashAuthPayload {
  signature: string;
  v: number;
  r: string;
  s: string;
}

/**
 * Gateway check eligibility response
 */
export interface EligibilityResponse {
  eligible: boolean;
  reason?: string;
  userBalance?: string;
  nonce?: string;
  deadline?: number;
}

/**
 * Error types
 */
export class FlashRailError extends Error {
  constructor(
    message: string,
    public code: FlashErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'FlashRailError';
  }
}

export enum FlashErrorCode {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  GATEWAY_ERROR = 'GATEWAY_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  MERCHANT_REJECTED = 'MERCHANT_REJECTED',
}