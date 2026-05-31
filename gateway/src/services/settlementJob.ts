import cron from 'node-cron';
import { config } from '../config';
import { getPendingSettlements, markSettled, logTransaction } from './database';
import { settleBatch, estimateSettlementGas, getGasPrice } from './vaultService';

let isSettling = false;
let settlementTask: cron.ScheduledTask | null = null;

/**
 * Start settlement job (runs periodically)
 */
export function startSettlementJob() {
  // Convert interval to cron expression
  const intervalSeconds = Math.floor(config.settlementIntervalMs / 1000);
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  settlementTask = cron.schedule(cronExpression, async () => {
    await runSettlement();
  });

  console.log(`Settlement job started (every ${intervalSeconds}s)`);
}

/**
 * Stop settlement job
 */
export function stopSettlementJob() {
  if (settlementTask) {
    settlementTask.stop();
    settlementTask = null;
    console.log('Settlement job stopped');
  }
}

/**
 * Run settlement process
 */
export async function runSettlement(): Promise<void> {
  if (isSettling) {
    console.log('Settlement already in progress, skipping...');
    return;
  }

  isSettling = true;

  try {
    // Get pending settlements
    const pending = getPendingSettlements(config.settlementBatchSize);

    if (pending.length === 0) {
      // No settlements needed
      return;
    }

    console.log(`\nProcessing ${pending.length} pending settlements...`);

    // Group by token (can only settle same token in one batch)
    const byToken = groupByToken(pending);

    for (const [token, settlements] of Object.entries(byToken)) {
      await settleBatchForToken(token, settlements);
    }

    console.log('Settlement batch completed\n');

  } catch (error) {
    console.error('Settlement error:', error);
  } finally {
    isSettling = false;
  }
}

/**
 * Settle a batch for a specific token
 */
async function settleBatchForToken(
  token: string,
  settlements: any[]
): Promise<void> {
  try {
    const users = settlements.map(s => s.user);
    const merchants = settlements.map(s => s.merchant);
    const tokens = settlements.map(() => token);
    const amounts = settlements.map(s => s.amount);
    const ids = settlements.map(s => s.id);

    // Estimate gas
    const gasEstimate = await estimateSettlementGas(users, merchants, tokens, amounts);
    const gasPrice = await getGasPrice();
    const gasCost = gasEstimate * BigInt(gasPrice);

    console.log(`   Token: ${token.substring(0, 8)}...`);
    console.log(`   Settlements: ${settlements.length}`);
    console.log(`   Est. Gas: ${gasEstimate.toString()}`);
    console.log(`   Gas Cost: ${gasCost.toString()} wei`);

    // Check if settlement key is configured
    if (!config.settlementPrivateKey) {
      console.warn('Settlement private key not configured, simulating...');
      
      // Simulate settlement (for testing without private key)
      const mockTxHash = `0x${Date.now().toString(16)}`;
      markSettled(ids, mockTxHash);
      
      console.log(`Simulated settlement: ${mockTxHash}`);
      return;
    }

    // Execute on-chain settlement
    const txHash = await settleBatch(users, merchants, tokens, amounts);
    
    // Mark as settled in database
    markSettled(ids, txHash);

    // Log settlements
    settlements.forEach(s => {
      logTransaction({
        type: 'SETTLEMENT',
        user: s.user,
        merchant: s.merchant,
        amount: s.amount,
        token: s.token,
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
      });
    });

    console.log(`Settlement tx: ${txHash}`);

  } catch (error) {
    console.error(`Failed to settle batch for token ${token}:`, error);
    
    // Log failed settlement
    settlements.forEach(s => {
      logTransaction({
        type: 'SETTLEMENT',
        user: s.user,
        merchant: s.merchant,
        amount: s.amount,
        token: s.token,
        success: false,
        reason: error instanceof Error ? error.message : 'Settlement failed',
        timestamp: Math.floor(Date.now() / 1000),
      });
    });
  }
}

/**
 * Group settlements by token
 */
function groupByToken(settlements: any[]): Record<string, any[]> {
  return settlements.reduce((groups, settlement) => {
    const token = settlement.token;
    if (!groups[token]) {
      groups[token] = [];
    }
    groups[token].push(settlement);
    return groups;
  }, {} as Record<string, any[]>);
}

/**
 * Manually trigger settlement (for testing)
 */
export async function triggerManualSettlement(): Promise<void> {
  console.log('Manual settlement triggered');
  await runSettlement();
}

/**
 * Get settlement status
 */
export function getSettlementStatus() {
  return {
    isActive: settlementTask !== null,
    isProcessing: isSettling,
    interval: config.settlementIntervalMs,
    batchSize: config.settlementBatchSize,
  };
}