import dotenv from 'dotenv';
import { Config } from '../types';

dotenv.config();

export const config: Config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseRpcUrl: process.env.BASE_RPC_URL || 'https://sepolia.base.org',
  chainId: parseInt(process.env.CHAIN_ID || '84532'),
  vaultAddress: process.env.VAULT_ADDRESS || '0x0000000000000000000000000000000000000000',
  merchantRegistryAddress: process.env.MERCHANT_REGISTRY_ADDRESS || '0x0000000000000000000000000000000000000000',
  settlementIntervalMs: parseInt(process.env.SETTLEMENT_INTERVAL_MS || '60000'),
  settlementBatchSize: parseInt(process.env.SETTLEMENT_BATCH_SIZE || '50'),
  settlementPrivateKey: process.env.SETTLEMENT_PRIVATE_KEY || process.env.PRIVATE_KEY,
  riskMaxPerUserDaily: process.env.RISK_MAX_PER_USER_DAILY || '1000000000',
  riskNewUserLimit: process.env.RISK_NEW_USER_LIMIT || '50000000',
  riskMinBalanceRatio: parseFloat(process.env.RISK_MIN_BALANCE_RATIO || '0.2'),
  databasePath: process.env.DATABASE_PATH || './data/gateway.db',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validate critical config
if (config.nodeEnv === 'production') {
  if (config.vaultAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('VAULT_ADDRESS must be set in production');
  }
  if (config.merchantRegistryAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error('MERCHANT_REGISTRY_ADDRESS must be set in production');
  }
}

export default config;