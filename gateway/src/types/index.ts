/**
 * Gateway TypeScript Types
 */

export interface Config {
  port: number;
  nodeEnv: string;
  baseRpcUrl: string;
  chainId: number;
  vaultAddress: string;
  merchantRegistryAddress: string;
  settlementIntervalMs: number;
  settlementBatchSize: number;
  settlementPrivateKey?: string;
  riskMaxPerUserDaily: string;
  riskNewUserLimit: string;
  riskMinBalanceRatio: number;
  databasePath: string;
  corsOrigins: string[];
  logLevel: string;
}

export interface EligibilityCheckRequest {
  user: string;
  merchant: string;
  amount: string;
  token: string;
  chainId: number;
}

export interface EligibilityCheckResponse {
  eligible: boolean;
  reason?: string;
  userBalance?: string;
  nonce?: string;
  deadline?: number;
}

export interface FlashValidationRequest {
  user: string;
  merchant: string;
  amount: string;
  token: string;
  nonce: string;
  deadline: string;
  signature: string;
}

export interface FlashValidationResponse {
  valid: boolean;
  message?: string;
  error?: string;
}

export interface PendingSettlement {
  id?: number;
  user: string;
  merchant: string;
  token: string;
  amount: string;
  timestamp: number;
  settled: boolean;
}

export interface TransactionLog {
  id?: number;
  type: 'ELIGIBILITY_CHECK' | 'FLASH_AUTH' | 'SETTLEMENT' | 'VALIDATION';
  user: string;
  merchant: string;
  amount: string;
  token: string;
  success: boolean;
  reason?: string;
  timestamp: number;
}

export interface RiskProfile {
  user: string;
  totalSpent: string;
  transactionCount: number;
  lastTransaction: number;
  riskScore: number;
}

export interface VaultBalance {
  total: string;
  reserved: string;
  available: string;
}

export interface MerchantConfig {
  enabled: boolean;
  settlement: string;
  maxOutstanding: string;
  feeBps: number;
  riskTier: number;
}