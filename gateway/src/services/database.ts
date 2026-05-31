import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { TransactionLog, PendingSettlement, RiskProfile } from '../types';
import { toBigInt } from '../utils/bigint';

let db: Database.Database;

/**
 * Initialize database and create tables
 */
export function initDatabase(): Database.Database {
  // Ensure data directory exists
  const dbDir = path.dirname(config.databasePath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Open database
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');

  // Read and execute schema
  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  console.log('✅ Database initialized:', config.databasePath);
  return db;
}

/**
 * Get database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Log a transaction
 */
export function logTransaction(log: TransactionLog): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO transaction_logs (type, user, merchant, amount, token, success, reason, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    log.type,
    log.user,
    log.merchant,
    log.amount,
    log.token,
    log.success ? 1 : 0,
    log.reason || null,
    log.timestamp
  );
}

/**
 * Add pending settlement
 */
export function addPendingSettlement(settlement: PendingSettlement): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO pending_settlements (user, merchant, token, amount, timestamp, settled)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const result = stmt.run(
    settlement.user,
    settlement.merchant,
    settlement.token,
    settlement.amount,
    settlement.timestamp
  );

  return result.lastInsertRowid as number;
}

/**
 * Get pending settlements (unsettled)
 */
export function getPendingSettlements(limit: number = 50): PendingSettlement[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM pending_settlements
    WHERE settled = 0
    ORDER BY timestamp ASC
    LIMIT ?
  `);

  return stmt.all(limit) as PendingSettlement[];
}

/**
 * Mark settlements as settled
 */
export function markSettled(ids: number[], txHash: string): void {
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE pending_settlements
    SET settled = 1, tx_hash = ?
    WHERE id IN (${placeholders})
  `);

  stmt.run(txHash, ...ids);
}

/**
 * Get or create risk profile for user
 */
export function getRiskProfile(user: string): RiskProfile {
  const db = getDatabase();
  
  // Try to get existing profile
  let profile = db.prepare('SELECT * FROM risk_profiles WHERE user = ?').get(user) as RiskProfile | undefined;

  // Create if doesn't exist
  if (!profile) {
    db.prepare(`
      INSERT INTO risk_profiles (user, total_spent, transaction_count, last_transaction, risk_score)
      VALUES (?, '0', 0, 0, 0)
    `).run(user);

    profile = {
      user,
      totalSpent: '0',
      transactionCount: 0,
      lastTransaction: 0,
      riskScore: 0,
    };
  }

  return profile;
}

/**
 * Update risk profile after transaction
 */
export function updateRiskProfile(user: string, amount: string, success: boolean): void {
  const db = getDatabase();
  const profile = getRiskProfile(user);

  const newTotalSpent = success 
    ? (BigInt(profile.totalSpent) + toBigInt(amount)).toString()
    : profile.totalSpent;
  
  const newCount = success ? profile.transactionCount + 1 : profile.transactionCount;
  const now = Math.floor(Date.now() / 1000);
  
  // Simple risk scoring: 0 = good, higher = riskier
  let riskScore = profile.riskScore;
  if (!success) {
    riskScore += 1; // Increase risk on failure
  } else if (success && riskScore > 0) {
    riskScore = Math.max(0, riskScore - 1); // Decrease risk on success
  }

  db.prepare(`
    UPDATE risk_profiles
    SET total_spent = ?, transaction_count = ?, last_transaction = ?, risk_score = ?
    WHERE user = ?
  `).run(newTotalSpent, newCount, now, riskScore, user);
}

/**
 * Get user's transaction history
 */
export function getUserTransactions(user: string, limit: number = 100): TransactionLog[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM transaction_logs
    WHERE user = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(user, limit) as TransactionLog[];
}

/**
 * Get gateway metrics for dashboard
 */
export function getGatewayMetrics() {
  const db = getDatabase();

  // Total volume
  const totalVolume = db.prepare(`
    SELECT SUM(CAST(amount AS INTEGER)) as total
    FROM transaction_logs
    WHERE success = 1 AND type = 'FLASH_AUTH'
  `).get() as { total: number };

  // Transaction counts
  const counts = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN type = 'FLASH_AUTH' THEN 1 ELSE 0 END) as flash,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful
    FROM transaction_logs
  `).get() as { total: number; flash: number; successful: number };

  // Unique users
  const users = db.prepare(`
    SELECT COUNT(DISTINCT user) as count
    FROM transaction_logs
  `).get() as { count: number };

  // Unique merchants
  const merchants = db.prepare(`
    SELECT COUNT(DISTINCT merchant) as count
    FROM transaction_logs
  `).get() as { count: number };

  // Pending settlements
  const pending = db.prepare(`
    SELECT COUNT(*) as count, SUM(CAST(amount AS INTEGER)) as total
    FROM pending_settlements
    WHERE settled = 0
  `).get() as { count: number; total: number };

  return {
    totalVolume: totalVolume.total?.toString() || '0',
    transactionCount: counts.total,
    flashCount: counts.flash,
    successRate: counts.total > 0 ? (counts.successful / counts.total) * 100 : 0,
    uniqueUsers: users.count,
    uniqueMerchants: merchants.count,
    pendingSettlements: pending.count,
    pendingVolume: pending.total?.toString() || '0',
  };
}

/**
 * Clean up old logs (retention policy)
 */
export function cleanupOldLogs(daysToKeep: number = 30): void {
  const db = getDatabase();
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);

  const result = db.prepare(`
    DELETE FROM transaction_logs
    WHERE timestamp < ?
  `).run(cutoff);

  console.log(`🗑️  Cleaned up ${result.changes} old log entries`);
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('✅ Database connection closed');
  }
}