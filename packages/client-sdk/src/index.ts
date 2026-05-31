/**
 * @flash-rail/client-sdk
 * 
 * Client SDK for Flash Credit Rail payments on Base x402
 * 
 * @example
 * ```typescript
 * import { FlashRailClient } from '@flash-rail/client-sdk';
 * import { BrowserProvider } from 'ethers';
 * 
 * // Setup
 * const provider = new BrowserProvider(window.ethereum);
 * const signer = await provider.getSigner();
 * 
 * const client = new FlashRailClient({
 *   gatewayUrl: 'https://gateway.flash-rail.xyz',
 *   signer,
 *   chainId: 25,
 *   vaultAddress: '0x...'
 * });
 * 
 * // Make paid API call
 * const response = await client.fetch('https://api.example.com/ai-text', {
 *   method: 'POST',
 *   body: JSON.stringify({ prompt: 'Hello' })
 * });
 * 
 * console.log(response.data); // API response
 * console.log(response.method); // 'FLASH' or 'FREE'
 * console.log(response.latency); // Request time in ms
 * ```
 */

// Main classes
export { FlashRailClient, flashFetch } from './flashFetch';

// Signature helpers
export {
  signFlashAuth,
  createFlashPaymentHeader,
  getDeadlineTimestamp,
  getEIP712Domain,
  FLASH_AUTH_TYPES,
} from './signer';

// Utilities
export {
  is402Response,
  parse402Response,
  fetchWithTimeout,
  formatTokenAmount,
} from './utils';

// Types
export type {
  FlashFetchConfig,
  FlashFetchOptions,
  FlashFetchResponse,
  PaymentMethod,
  PaymentDetails,
  X402Response,
  FlashAuthPayload,
  FlashAuth,
  EligibilityResponse,
  Signer,
} from './types';

export { FlashRailError, FlashErrorCode } from './types';