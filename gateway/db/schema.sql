-- Flash Rail Gateway Database Schema

-- Transaction logs (all gateway activity)
CREATE TABLE IF NOT EXISTS transaction_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  user TEXT NOT NULL,
  merchant TEXT NOT NULL,
  amount TEXT NOT NULL,
  token TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  timestamp INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_user ON transaction_logs(user);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON transaction_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_type ON transaction_logs(type);

-- Pending settlements (awaiting on-chain settlement)
CREATE TABLE IF NOT EXISTS pending_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  merchant TEXT NOT NULL,
  token TEXT NOT NULL,
  amount TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0,
  tx_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settlements_user ON pending_settlements(user);
CREATE INDEX IF NOT EXISTS idx_settlements_settled ON pending_settlements(settled);
CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON pending_settlements(merchant);

-- Risk profiles (user risk scoring)
CREATE TABLE IF NOT EXISTS risk_profiles (
  user TEXT PRIMARY KEY,
  total_spent TEXT NOT NULL DEFAULT '0',
  transaction_count INTEGER NOT NULL DEFAULT 0,
  last_transaction INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risk_score ON risk_profiles(risk_score);

-- Merchant stats (cached merchant data)
CREATE TABLE IF NOT EXISTS merchant_stats (
  merchant TEXT PRIMARY KEY,
  total_volume TEXT NOT NULL DEFAULT '0',
  transaction_count INTEGER NOT NULL DEFAULT 0,
  last_settlement INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Gateway metrics (aggregated stats)
CREATE TABLE IF NOT EXISTS gateway_metrics (
  date TEXT PRIMARY KEY,
  total_volume TEXT NOT NULL DEFAULT '0',
  flash_count INTEGER NOT NULL DEFAULT 0,
  user_count INTEGER NOT NULL DEFAULT 0,
  merchant_count INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);