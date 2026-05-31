// @ts-nocheck
import { Router } from 'express';
import { config } from '../config';
import { getGatewayMetrics } from '../services/database';
import { getSettlementStatus } from '../services/settlementJob';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /health - Basic health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /status - Detailed status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const metrics = getGatewayMetrics();
  const settlement = getSettlementStatus();

  res.json({
    status: 'ok',
    version: '1.0.0',
    config: {
      chainId: config.chainId,
      vaultAddress: config.vaultAddress,
      environment: config.nodeEnv,
    },
    metrics,
    settlement,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /metrics - Gateway metrics for dashboard
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = getGatewayMetrics();
  res.json(metrics);
}));

export default router;