import { ethers } from 'ethers';
import { config } from '../config';
import { FlashValidationRequest } from '../types';

/**
 * EIP-712 Domain for Flash Credit Vault
 */
function getEIP712Domain() {
  return {
    name: 'FlashCreditVault',
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.vaultAddress,
  };
}

/**
 * EIP-712 Types for Flash Authorization
 */
const FLASH_AUTH_TYPES = {
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
 * Verify EIP-712 signature for Flash authorization
 */
export async function verifySignature(request: FlashValidationRequest): Promise<boolean> {
  try {
    const domain = getEIP712Domain();

    const value = {
      user: request.user,
      merchant: request.merchant,
      amount: request.amount,
      token: request.token,
      nonce: request.nonce,
      deadline: request.deadline,
    };

    // Reconstruct the typed data hash
    const digest = ethers.TypedDataEncoder.hash(domain, FLASH_AUTH_TYPES, value);

    // Recover signer from signature
    const recoveredAddress = ethers.recoverAddress(digest, request.signature);

    // Verify recovered address matches user
    return recoveredAddress.toLowerCase() === request.user.toLowerCase();

  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Check if signature deadline has passed
 */
export function isDeadlineValid(deadline: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const deadlineNum = parseInt(deadline);
  return now <= deadlineNum;
}