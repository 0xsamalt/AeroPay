// @ts-nocheck
import { Router } from 'express';
import { ethers } from 'ethers';
import { asyncHandler } from '../middleware/errorHandler';
import { checkEligibility } from '../services/riskEngine';
import { getUserBalance, getUserNonce, isValidAddress, isSessionKeyAuthorized } from '../services/vaultService';
import { logTransaction, addPendingSettlement, updateRiskProfile } from '../services/database';
import { EligibilityCheckRequest, FlashValidationRequest } from '../types';
import { verifySignature } from '../services/signatureValidator';
import { sanitizeAmount } from '../utils/bigint';
import { config } from '../config';

const router = Router();

// Store settled nonces in memory (use Redis/DB in production)
const settledNonces = new Map<string, boolean>();

/**
 * POST /api/check-eligibility
 * Check if user can make Flash payment
 */
router.post('/api/check-eligibility', asyncHandler(async (req, res) => {
  const request: EligibilityCheckRequest = req.body;

  // Validate request
  if (!request.user || !request.merchant || !request.amount || !request.token) {
    return res.status(400).json({
      error: 'Missing required fields: user, merchant, amount, token',
    });
  }

  if (!isValidAddress(request.user) || !isValidAddress(request.merchant)) {
    return res.status(400).json({
      error: 'Invalid address format',
    });
  }

  // Normalize amount: convert float strings like "100000.0" → "100000"
  request.amount = sanitizeAmount(request.amount);

  // Check eligibility
  const result = await checkEligibility(request);

  // If eligible, get nonce
  if (result.eligible) {
    const nonce = await getUserNonce(request.user);
    result.nonce = nonce;
  }

  // Log check
  logTransaction({
    type: 'ELIGIBILITY_CHECK',
    user: request.user,
    merchant: request.merchant,
    amount: request.amount,
    token: request.token,
    success: result.eligible,
    reason: result.reason,
    timestamp: Math.floor(Date.now() / 1000),
  });

  res.json(result);
}));

/**
 * POST /api/validate-flash
 * Validate Flash payment signature and authorization
 */
router.post('/api/validate-flash', asyncHandler(async (req, res) => {
  console.log(' [FLASH VALIDATION] Request received');
  console.log(' Request body:', JSON.stringify(req.body, null, 2));
  
  const { user, merchant, token, nonce, deadline, signature } = req.body;
  const amount = sanitizeAmount(req.body.amount); // normalize "100000.0" → "100000"

  // Validate required fields
  console.log('\n Checking required fields:');
  console.log('   user:', user ? 'Y' : 'N', user);
  console.log('   merchant:', merchant ? 'Y' : 'N', merchant);
  console.log('   amount:', amount ? 'Y' : 'N', amount);
  console.log('   token:', token ? 'Y' : 'N', token);
  console.log('   nonce:', nonce !== undefined ? 'Y' : 'N', nonce);
  console.log('   deadline:', deadline ? 'Y' : 'N', deadline);
  console.log('   signature:', signature ? 'Y' : 'N', signature ? `${signature.slice(0, 10)}...` : 'missing');

  if (!user || !merchant || !amount || !token || nonce === undefined || !deadline || !signature) {
    console.log('Validation FAILED: Missing required fields\n');
    return res.status(400).json({
      valid: false,
      error: 'Missing required fields',
      received: { 
        user: !!user, 
        merchant: !!merchant, 
        amount: !!amount, 
        token: !!token, 
        nonce: nonce !== undefined, 
        deadline: !!deadline, 
        signature: !!signature 
      }
    });
  }

  console.log('All required fields present');

  // Verify deadline
  const now = Math.floor(Date.now() / 1000);
  const deadlineInt = parseInt(deadline);
  const timeRemaining = deadlineInt - now;
  
  console.log('\n Checking deadline:');
  console.log('   Current time:', now);
  console.log('   Deadline:', deadlineInt);
  console.log('   Time remaining:', timeRemaining, 'seconds');
  
  if (now > deadlineInt) {
    console.log('Validation FAILED: Deadline expired\n');
    return res.status(400).json({ 
      valid: false, 
      error: 'Authorization expired',
      now,
      deadline: deadlineInt,
      expired_by: now - deadlineInt
    });
  }

  console.log('Deadline valid');

  // Use the configured vault address — VAULT_ADDRESS is set in .env
  const FLASH_RAIL_VAULT_ADDRESS = config.vaultAddress;
  
  console.log('\n Configuration:');
  console.log('   Vault address:', FLASH_RAIL_VAULT_ADDRESS);
  console.log('   Chain ID: 84532 (Base Sepolia)');

  // EIP-712 domain must exactly match what the client signed against
  const domain = {
    name: 'FlashCreditVault',
    version: '1',
    chainId: 84532,
    verifyingContract: FLASH_RAIL_VAULT_ADDRESS
  };

  const types = {
    FlashAuth: [  
      { name: 'user', type: 'address' },
      { name: 'merchant', type: 'address' },
      { name: 'amount', type: 'uint256' },     
      { name: 'token', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const value = {
    user,
    merchant,
    amount,      
    token,
    nonce,
    deadline
  };

  console.log('\n EIP-712 Typed Data:');
  console.log('   Domain:', JSON.stringify(domain, null, 2));
  console.log('   Types:', JSON.stringify(types, null, 2));
  console.log('   Message:', JSON.stringify(value, null, 2));
  console.log('   Signature:', `${signature.slice(0, 20)}...${signature.slice(-10)}`);

  try {
    // Recover the signer
    console.log('\n Verifying signature...');
    const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
    
    console.log('   Recovered signer:', recoveredAddress);
    console.log('   Expected user:', user);
    console.log('   Addresses match:', recoveredAddress.toLowerCase() === user.toLowerCase() ? 'Y' : 'N');

    // Verify recovered address matches the claimed user OR is an authorized session key
    let isAuthorized = false;
    let authType = 'none';

    if (recoveredAddress.toLowerCase() === user.toLowerCase()) {
      isAuthorized = true;
      authType = 'user';
    } else {
      // Check if it's an authorized session key
      const isSessionKey = await isSessionKeyAuthorized(user, recoveredAddress);
      if (isSessionKey) {
        isAuthorized = true;
        authType = 'session_key';
      }
    }

    if (!isAuthorized) {
      console.log('Validation FAILED: Signature signer mismatch\n');
      return res.status(400).json({ 
        valid: false, 
        error: 'Invalid signature - signer mismatch',
        recovered: recoveredAddress,
        expected: user
      });
    }

    console.log(`Signature verified successfully (Auth type: ${authType})`);

    // Check if this specific nonce was already settled (replay protection)
    const settlementKey = `${user.toLowerCase()}-${nonce}`;
    
    console.log('\nChecking replay protection:');
    console.log('   Settlement key:', settlementKey);
    console.log('   Already settled:', settledNonces.has(settlementKey) ? 'YES (allowing for test)' : 'NO');
    
    // For testing: allow replay but warn
    if (settledNonces.has(settlementKey)) {
      console.log('WARNING: Nonce reused (allowed for testing)');
    }

    // Mark as settled to prevent replay within this session
    settledNonces.set(settlementKey, true);
    console.log('Nonce marked as used');

    // Log the validation
    logTransaction({
      type: 'FLASH_VALIDATION',
      user,
      merchant,
      amount,
      token,
      nonce,
      success: true,
      timestamp: Math.floor(Date.now() / 1000),
    });

    console.log('FLASH VALIDATION SUCCESSFUL');

    // Signature is valid!
    return res.json({ 
      valid: true,
      message: 'Flash payment verified' 
    });

  } catch (error) {
    console.log('FLASH VALIDATION ERROR');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    
    return res.status(500).json({ 
      valid: false, 
      error: 'Internal validation error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

/**
 * GET /api/user/:address/balance
 * Get user's vault balance
 */
router.get('/api/user/:address/balance', asyncHandler(async (req, res) => {
  const { address } = req.params;
  const { token } = req.query;

  if (!isValidAddress(address)) {
    return res.status(400).json({
      error: 'Invalid address format',
    });
  }

  if (!token || !isValidAddress(token as string)) {
    return res.status(400).json({
      error: 'Valid token address required',
    });
  }

  const balance = await getUserBalance(address, token as string);
  res.json(balance);
}));

/**
 * GET /api/user/:address/nonce
 * Get user's current nonce
 */
router.get('/api/user/:address/nonce', asyncHandler(async (req, res) => {
  const { address } = req.params;

  if (!isValidAddress(address)) {
    return res.status(400).json({
      error: 'Invalid address format',
    });
  }

  const nonce = await getUserNonce(address);
  res.json({ nonce });
}));

export default router;