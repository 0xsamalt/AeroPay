import { FlashPaymentHeader } from './types';

/**
 * Validates Flash payment header with Gateway
 * In production, this makes an API call to the Gateway to verify:
 * 1. Signature is valid (cryptographic verification)
 * 2. Payment details match expected values
 * 3. Authorization hasn't expired
 * 
 * Note: The Gateway verifies the signature cryptographically WITHOUT checking
 * the current on-chain nonce, since the nonce in the signature might not match
 * the current on-chain nonce if settlement has already occurred.
 */
export async function validateFlashPayment(
  header: FlashPaymentHeader,
  expectedMerchant: string,
  expectedAmount: string,
  expectedToken: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Verify basic requirements match
    if (header.merchant.toLowerCase() !== expectedMerchant.toLowerCase()) {
      return { valid: false, error: 'Merchant address mismatch' };
    }

    if (header.token.toLowerCase() !== expectedToken.toLowerCase()) {
      return { valid: false, error: 'Token address mismatch' };
    }

    // Amount should be >= expected (allow overpayment)
    // Amount should be >= expected (allow overpayment)
    const headerAmount = BigInt(Math.floor(parseFloat(header.amount)));
    const expectedAmountBigInt = BigInt(Math.floor(parseFloat(expectedAmount)));
    if (headerAmount < expectedAmountBigInt) {
      return { valid: false, error: 'Insufficient payment amount' };
    }

    // Check deadline hasn't passed
    const now = Math.floor(Date.now() / 1000);
    const deadline = parseInt(header.deadline);
    if (now > deadline) {
      return { valid: false, error: 'Payment authorization expired' };
    }

    // Call Gateway to verify signature cryptographically
    // Gateway will:
    // 1. Recover signer from EIP-712 signature
    // 2. Verify signer matches header.user
    // 3. Optionally check if this nonce was already settled (replay protection)
    const response = await fetch(`${header.gatewayUrl}/api/validate-flash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: header.user,
        merchant: header.merchant,
        amount: header.amount,
        token: header.token,
        nonce: header.nonce,
        deadline: header.deadline,
        signature: header.signature,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Validation failed' })) as { message?: string };
      return { valid: false, error: errorData.message || 'Gateway validation failed' };
    }

    const result = await response.json() as { valid: boolean; error?: string };
    return { valid: result.valid, error: result.error };

  } catch (err) {
    console.error('Flash payment validation error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Validation error';
    return { 
      valid: false, 
      error: errorMessage
    };
  }
}

/**
 * Parses Flash payment header from request
 */
export function parseFlashHeader(headerValue: string): FlashPaymentHeader | null {
  try {
    const parsed = JSON.parse(headerValue);
    
    // Validate required fields
    const required = ['user', 'merchant', 'amount', 'token', 'nonce', 'deadline', 'signature', 'gatewayUrl'];
    for (const field of required) {
      if (!parsed[field]) {
        console.error(`Missing required field: ${field}`);
        return null;
      }
    }

    return parsed as FlashPaymentHeader;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown parse error';
    console.error('Failed to parse Flash payment header:', errorMessage);
    return null;
  }
}