import { Signature } from 'ethers';
import { Signer, FlashAuthPayload, FlashAuth } from './types';

/**
 * EIP-712 Domain for Flash Credit Vault
 */
export function getEIP712Domain(chainId: number, vaultAddress: string) {
  return {
    name: 'FlashCreditVault',
    version: '1',
    chainId,
    verifyingContract: vaultAddress,
  };
}

/**
 * EIP-712 Types for Flash Authorization
 */
export const FLASH_AUTH_TYPES = {
  FlashAuth: [
    { name: 'user', type: 'address' },
    { name: 'merchant', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Sign Flash authorization using EIP-712
 */
export async function signFlashAuth(
  signer: Signer,
  payload: FlashAuthPayload,
  chainId: number,
  vaultAddress: string
): Promise<FlashAuth> {
  try {
    const domain = getEIP712Domain(chainId, vaultAddress);

    // Sign typed data
    const signature = await signer.signTypedData(
      domain,
      FLASH_AUTH_TYPES,
      payload
    );

    // Split signature into v, r, s
    const sig = Signature.from(signature);

    return {
      ...payload,
      signature,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Signature failed';
    throw new Error(`Failed to sign Flash authorization: ${errorMessage}`);
  }
}

/**
 * Create Flash payment header for merchant
 */
export function createFlashPaymentHeader(
  auth: FlashAuth,
  gatewayUrl: string
): string {
  return JSON.stringify({
    user: auth.user,
    merchant: auth.merchant,
    amount: auth.amount,
    token: auth.token,
    nonce: auth.nonce,
    deadline: auth.deadline,
    signature: auth.signature,
    gatewayUrl,
  });
}

/**
 * Get current timestamp + offset (for deadline)
 */
export function getDeadlineTimestamp(offsetSeconds: number = 300): string {
  const now = Math.floor(Date.now() / 1000);
  return (now + offsetSeconds).toString();
}