import {
  FlashFetchConfig,
  FlashFetchOptions,
  FlashFetchResponse,
  PaymentMethod,
  FlashRailError,
  FlashErrorCode,
  EligibilityResponse,
  FlashAuthPayload,
} from './types';
import {
  signFlashAuth,
  createFlashPaymentHeader,
  getDeadlineTimestamp,
} from './signer';
import {
  is402Response,
  parse402Response,
  fetchWithTimeout,
  mergeHeaders,
} from './utils';

/**
 * Flash Rail Client - Main class
 */
export class FlashRailClient {
  private config: Required<FlashFetchConfig>;

  constructor(config: FlashFetchConfig) {
    this.config = {
      ...config,
      autoRetry: config.autoRetry ?? true,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * Main fetch method with Flash Rail support
   */
  async fetch<T = any>(
    url: string,
    options: FlashFetchOptions = {}
  ): Promise<FlashFetchResponse<T>> {
    const startTime = Date.now();

    try {
      // Step 1: Make initial request
      const initialResponse = await fetchWithTimeout(
        url,
        options,
        this.config.timeout
      );

      // If not 402, return response as-is
      if (!is402Response(initialResponse.status)) {
        const data = await this.parseResponse<T>(initialResponse);
        return {
          data,
          ok: initialResponse.ok,
          status: initialResponse.status,
          method: 'FREE',
          latency: Date.now() - startTime,
        };
      }

      // Step 2: Got 402 - parse payment requirements
      const paymentRequired = await parse402Response(initialResponse);
      if (!paymentRequired) {
        throw new FlashRailError(
          'Invalid 402 response format',
          FlashErrorCode.MERCHANT_REJECTED
        );
      }

      // Step 3: Check if Flash payment is eligible
      if (!this.config.autoRetry) {
        // User wants to handle 402 manually
        return {
          data: paymentRequired as T,
          ok: false,
          status: 402,
          method: 'FAILED',
          latency: Date.now() - startTime,
        };
      }

      // Step 4: Check Flash eligibility with Gateway
      const eligibility = await this.checkEligibility(paymentRequired);
      
      if (!eligibility.eligible) {
        throw new FlashRailError(
          `Flash payment not eligible: ${eligibility.reason}`,
          FlashErrorCode.INSUFFICIENT_BALANCE,
          { paymentRequired }
        );
      }

      // Step 5: Create and sign Flash authorization
      const userAddress = await this.config.signer.getAddress();
      const authPayload: FlashAuthPayload = {
        user: userAddress,
        merchant: paymentRequired.recipient,
        amount: paymentRequired.amount,
        token: paymentRequired.token,
        nonce: eligibility.nonce!,
        deadline: getDeadlineTimestamp(300), // 5 minutes
      };

      const signedAuth = await signFlashAuth(
        this.config.signer,
        authPayload,
        this.config.chainId,
        this.config.vaultAddress
      );

      // Step 6: Create Flash payment header
      const flashHeader = createFlashPaymentHeader(
        signedAuth,
        this.config.gatewayUrl
      );

      // Step 7: Retry request with Flash payment header
      const flashResponse = await fetchWithTimeout(
        url,
        {
          ...options,
          headers: mergeHeaders(options.headers, flashHeader),
        },
        this.config.timeout
      );

      // Step 8: Check if merchant accepted Flash payment
      if (!flashResponse.ok) {
        if (is402Response(flashResponse.status)) {
          throw new FlashRailError(
            'Merchant rejected Flash payment',
            FlashErrorCode.MERCHANT_REJECTED,
            { status: flashResponse.status }
          );
        }
        
        throw new FlashRailError(
          `Request failed with status ${flashResponse.status}`,
          FlashErrorCode.NETWORK_ERROR,
          { status: flashResponse.status }
        );
      }

      // Success! Parse and return data
      const data = await this.parseResponse<T>(flashResponse);
      
      return {
        data,
        ok: true,
        status: flashResponse.status,
        method: 'FLASH',
        latency: Date.now() - startTime,
        paymentDetails: {
          amount: authPayload.amount,
          token: authPayload.token,
          merchant: authPayload.merchant,
          user: authPayload.user,
          nonce: authPayload.nonce,
          signature: signedAuth.signature,
        },
      };

    } catch (err) {
      // Handle FlashRailError
      if (err instanceof FlashRailError) {
        throw err;
      }

      // Handle other errors
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new FlashRailError(
        errorMessage,
        FlashErrorCode.NETWORK_ERROR,
        { originalError: err }
      );
    }
  }

  /**
   * Check if user is eligible for Flash payment
   */
  private async checkEligibility(payment: {
    amount: string;
    token: string;
    recipient: string;
  }): Promise<EligibilityResponse> {
    try {
      const userAddress = await this.config.signer.getAddress();

      const response = await fetch(`${this.config.gatewayUrl}/api/check-eligibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: userAddress,
          merchant: payment.recipient,
          amount: payment.amount,
          token: payment.token,
          chainId: this.config.chainId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          eligible: false,
          reason: errorData.reason || 'Gateway check failed',
        };
      }

      return await response.json();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        eligible: false,
        reason: `Gateway error: ${errorMessage}`,
      };
    }
  }

  /**
   * Parse response body
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text() as T;
  }
}

/**
 * Convenience function: create client and make request
 */
export async function flashFetch<T = any>(
  url: string,
  config: FlashFetchConfig,
  options?: FlashFetchOptions
): Promise<FlashFetchResponse<T>> {
  const client = new FlashRailClient(config);
  return client.fetch<T>(url, options);
}