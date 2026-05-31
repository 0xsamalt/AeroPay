import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initDatabase, closeDatabase } from './services/database';
import { initVaultService } from './services/vaultService';
import { startSettlementJob, stopSettlementJob } from './services/settlementJob';
import healthRoutes from './routes/health';
import flashRoutes from './routes/flash';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

// Initialize services
console.log(' Initializing AeroPay Gateway...\n');
initDatabase();
initVaultService();

// Middleware
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json());
app.use(requestLogger);

// Routes
app.use(healthRoutes);
app.use(flashRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  AeroPay Gateway                                           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n Server running on http://localhost:${config.port}`);
  console.log(` Environment: ${config.nodeEnv}`);
  console.log(` Chain ID: ${config.chainId}`);
  console.log(` Vault: ${config.vaultAddress}`);
  console.log(`\n Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /status`);
  console.log(`   GET  /metrics`);
  console.log(`   POST /api/check-eligibility`);
  console.log(`   POST /api/validate-flash`);
  console.log(`\n Settlement job starting...\n`);
  
  // Start settlement job
  startSettlementJob();
});

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  
  stopSettlementJob();
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    closeDatabase();
    process.exit(0);
  });
  
  // Force close after 10s
  setTimeout(() => {
    console.error('❌ Forcing shutdown');
    process.exit(1);
  }, 10000);
}