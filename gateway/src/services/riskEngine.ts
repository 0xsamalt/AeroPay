import { config } from '../config';
import { getRiskProfile, getUserTransactions } from './database';
import { getUserBalance, getMerchantConfig, getMerchantOutstanding } from './vaultService';
import { EligibilityCheckRequest, EligibilityCheckResponse } from '../types';
import { toBigInt } from '../utils/bigint';

/**
 * Risk Engine - Determines if user can make Flash payment
 */

/**
 * Check if user is eligible for Flash payment
 */
export async function checkEligibility(
  request: EligibilityCheckRequest
): Promise<EligibilityCheckResponse> {
  try {
    // 1. Check user balance
    const balance = await getUserBalance(request.user, request.token);
    const availableBalance = BigInt(balance.available);
    const requestedAmount = toBigInt(request.amount);

    if (availableBalance < requestedAmount) {
      return {
        eligible: false,
        reason: `Insufficient balance. Available: ${balance.available}, Required: ${request.amount}`,
      };
    }

    // 2. Check merchant is enabled
    const merchantConfig = await getMerchantConfig(request.merchant);
    if (!merchantConfig.enabled) {
      return {
        eligible: false,
        reason: 'Merchant is not enabled in registry',
      };
    }

    // 3. Check merchant exposure limits
    const outstanding = await getMerchantOutstanding(request.merchant, request.token);
    const outstandingAmount = BigInt(outstanding);
    const maxOutstanding = BigInt(merchantConfig.maxOutstanding);

    if (outstandingAmount + requestedAmount > maxOutstanding) {
      return {
        eligible: false,
        reason: `Merchant exposure limit reached. Outstanding: ${outstanding}, Max: ${merchantConfig.maxOutstanding}`,
      };
    }

    // 4. Apply risk engine rules
    const riskCheck = await applyRiskRules(
      request.user,
      request.merchant,
      request.amount,
      balance.available,
      merchantConfig.riskTier
    );

    if (!riskCheck.eligible) {
      return riskCheck;
    }

    // 5. Calculate credit limit for this user
    const creditLimit = calculateCreditLimit(
      balance.available,
      request.user,
      merchantConfig.riskTier
    );

    if (requestedAmount > BigInt(creditLimit)) {
      return {
        eligible: false,
        reason: `Amount exceeds credit limit. Limit: ${creditLimit}, Requested: ${request.amount}`,
      };
    }

    // All checks passed!
    return {
      eligible: true,
      userBalance: balance.available,
      nonce: '0', // Will be fetched from contract if needed
      deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    };

  } catch (error) {
    console.error('Error checking eligibility:', error);
    return {
      eligible: false,
      reason: error instanceof Error ? error.message : 'Eligibility check failed',
    };
  }
}

/**
 * Apply risk-based rules
 */
async function applyRiskRules(
  user: string,
  merchant: string,
  amount: string,
  availableBalance: string,
  merchantRiskTier: number
): Promise<EligibilityCheckResponse> {
  // Get user's risk profile
  const profile = getRiskProfile(user);

  // Rule 1: Check daily spending limit
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 86400;
  
  const recentTransactions = getUserTransactions(user, 1000)
    .filter(tx => tx.timestamp > oneDayAgo && tx.success);
  
  const dailySpent = recentTransactions.reduce((sum, tx) => {
    return sum + toBigInt(tx.amount);
  }, BigInt(0));

  const maxDaily = BigInt(config.riskMaxPerUserDaily);
  
  if (dailySpent + toBigInt(amount) > maxDaily) {
    return {
      eligible: false,
      reason: `Daily spending limit exceeded. Spent today: ${dailySpent.toString()}, Max: ${config.riskMaxPerUserDaily}`,
    };
  }

  // Rule 2: New user limits (first 10 transactions)
  if (profile.transactionCount < 10) {
    const newUserLimit = BigInt(config.riskNewUserLimit);
    if (toBigInt(amount) > newUserLimit) {
      return {
        eligible: false,
        reason: `New user limit. Limit: ${config.riskNewUserLimit}, Requested: ${amount}`,
      };
    }
  }

  // Rule 3: High-risk merchant requires higher balance
  if (merchantRiskTier >= 4) {
    // High risk merchants: require at least 50% of balance
    const minRequired = BigInt(availableBalance) / BigInt(2);
    if (toBigInt(amount) > minRequired) {
      return {
        eligible: false,
        reason: `High-risk merchant requires more available balance`,
      };
    }
  }

  // Rule 4: User risk score check
  if (profile.riskScore > 5) {
    return {
      eligible: false,
      reason: `User risk score too high: ${profile.riskScore}. Please contact support.`,
    };
  }

  // Rule 5: Rate limiting (max 10 txs per minute)
  const oneMinuteAgo = now - 60;
  const recentCount = recentTransactions.filter(tx => tx.timestamp > oneMinuteAgo).length;
  
  if (recentCount >= 10) {
    return {
      eligible: false,
      reason: 'Rate limit exceeded. Please wait a moment.',
    };
  }

  return { eligible: true };
}

/**
 * Calculate credit limit for user based on balance and risk
 */
function calculateCreditLimit(
  availableBalance: string,
  user: string,
  merchantRiskTier: number
): string {
  const balance = BigInt(availableBalance);
  const profile = getRiskProfile(user);

  // Base limit: percentage of available balance
  let ratio = config.riskMinBalanceRatio; // Default 20%

  // Adjust based on user history
  if (profile.transactionCount > 100 && profile.riskScore === 0) {
    ratio = 0.5; // Trusted users: 50%
  } else if (profile.transactionCount < 10) {
    ratio = 0.1; // New users: 10%
  }

  // Adjust based on merchant risk
  if (merchantRiskTier >= 4) {
    ratio *= 0.5; // Reduce for high-risk merchants
  }

  const limit = balance * BigInt(Math.floor(ratio * 100)) / BigInt(100);

  // Apply absolute caps
  const maxSingleTransaction = BigInt('100000000'); // 100 USDC max
  const newUserMax = BigInt(config.riskNewUserLimit);

  if (profile.transactionCount < 10) {
    return limit > newUserMax ? newUserMax.toString() : limit.toString();
  }

  return limit > maxSingleTransaction ? maxSingleTransaction.toString() : limit.toString();
}

/**
 * Evaluate transaction after completion
 */
export function evaluateTransaction(
  user: string,
  amount: string,
  success: boolean,
  latencyMs: number
): void {
  // This can be extended with ML-based fraud detection
  // For now, just log suspicious patterns

  if (!success) {
    console.warn(`⚠️  Failed transaction for user ${user}: ${amount}`);
  }

  if (latencyMs > 10000) {
    console.warn(`⚠️  Slow transaction for user ${user}: ${latencyMs}ms`);
  }
}

/**
 * Get user's current credit limit
 */
export async function getUserCreditLimit(user: string, token: string): Promise<string> {
  try {
    const balance = await getUserBalance(user, token);
    const limit = calculateCreditLimit(balance.available, user, 1);
    return limit;
  } catch (error) {
    console.error('Error calculating credit limit:', error);
    return '0';
  }
}