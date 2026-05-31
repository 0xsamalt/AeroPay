import { X402Response, FlashRailError, FlashErrorCode } from './types';

/**
 * Check if response is a 402 Payment Required
 */
export function is402Response(status: number): boolean {
  return status === 402;
}

/**
 * Parse x402 payment requirements from response
 */
export async function parse402Response(response: Response): Promise<X402Response | null> {
  try {
    const data = await response.json();
    
    // Validate required fields
    if (!data.amount || !data.token || !data.recipient || !data.chainId) {
      console.error('Invalid 402 response format:', data);
      return null;
    }

    return {
      amount: data.amount,
      token: data.token,
      recipient: data.recipient,
      chainId: data.chainId,
      description: data.description,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Parse failed';
    console.error('Failed to parse 402 response:', errorMessage);
    return null;
  }
}

/**
 * Fetch with timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (err instanceof Error && err.name === 'AbortError') {
      throw new FlashRailError(
        'Request timeout',
        FlashErrorCode.TIMEOUT,
        { url, timeoutMs }
      );
    }
    
    throw new FlashRailError(
      'Network error',
      FlashErrorCode.NETWORK_ERROR,
      { url, error: err instanceof Error ? err.message : 'Unknown error' }
    );
  }
}

/**
 * Merge headers with Flash payment header
 */
export function mergeHeaders(
  existingHeaders: HeadersInit | undefined,
  flashPaymentHeader: string
): Headers {
  const headers = new Headers(existingHeaders);
  headers.set('X-FLASH-PAYMENT', flashPaymentHeader);
  return headers;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: string, decimals: number = 6): string {
  const amountBigInt = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = amountBigInt / divisor;
  const fraction = amountBigInt % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole}.${fractionStr}`;
}

/**
 * Simple delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      
      if (i < maxRetries - 1) {
        const delayMs = baseDelayMs * Math.pow(2, i);
        await delay(delayMs);
      }
    }
  }

  throw lastError;
}