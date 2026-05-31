import { ethers } from 'ethers';
import { config } from '../config';
import { VaultBalance, MerchantConfig } from '../types';
import { toBigInt } from '../utils/bigint';

// FlashCreditVault ABI
const VAULT_ABI = [
  'function totalDeposited(address user, address token) public view returns (uint256)',
  'function reserved(address user, address token) public view returns (uint256)',
  'function nonces(address user) public view returns (uint256)',
  'function merchantOutstanding(address merchant, address token) public view returns (uint256)',
  'function supportedTokens(address token) public view returns (bool)',
  'function sessions(address user, address sessionKey) public view returns (uint256 limit, uint256 spent, uint256 expiry, bool active)',
  'function getTotalDeposited(address user, address token) external view returns (uint256)',
  'function getReserved(address user, address token) external view returns (uint256)',
  'function availableBalance(address user, address token) public view returns (uint256)',
  'function reservedForMerchant(address user, address merchant, address token) external view returns (uint256)',
  'function authorizeFlash((address user, address merchant, uint256 amount, address token, uint256 nonce, uint256 deadline, uint8 v, bytes32 r, bytes32 s)) external',
  'function settleFlash(address user, address merchant, address token, uint256 amount) external',
  'function settleFlashBatch(address[] calldata users, address[] calldata merchants, address[] calldata tokens, uint256[] calldata amounts) external',
  'function deposit(address token, uint256 amount) external',
  'function withdraw(address token, uint256 amount) external',
];

// MerchantRegistry ABI
const REGISTRY_ABI = [
  'function getMerchantConfig(address merchant) view returns (bool enabled, address settlement, uint256 maxOutstanding, uint16 feeBps, uint8 riskTier)',
];

// Free public Base Sepolia RPC endpoints (tested working, no API key required)
const BASE_SEPOLIA_RPCS = [
  'https://84532.rpc.thirdweb.com',                        // Thirdweb ✔ confirmed
  'https://base-sepolia-rpc.publicnode.com',                // Publicnode ✔ confirmed
  'https://endpoints.omniatech.io/v1/base/sepolia/public',  // Omnia
  'https://sepolia.base.org',                              // Official Base
];

// Nonce cache to avoid redundant RPC calls (cleared every 30s)
const nonceCache = new Map<string, { value: string; ts: number }>();
const NONCE_CACHE_TTL_MS = 30_000;

let provider: ethers.JsonRpcProvider;
let vaultContract: ethers.Contract;
let registryContract: ethers.Contract;

/**
 * Wraps any promise with a timeout. Throws on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

/**
 * Try RPC call against each endpoint in sequence. Returns on first success.
 */
async function rpcWithFallback<T>(fn: (contract: ethers.Contract) => Promise<T>, label: string): Promise<T> {
  const timeoutMs = 5_000; // 5s per attempt — fail fast to hit next RPC
  let lastErr: any;

  for (const rpcUrl of BASE_SEPOLIA_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(rpcUrl);
      const vc = new ethers.Contract(config.vaultAddress, VAULT_ABI, p);
      const result = await withTimeout(fn(vc), timeoutMs, label);
      // If this wasn't the primary, update the active provider silently
      if (rpcUrl !== BASE_SEPOLIA_RPCS[0]) {
        console.log(`[RPC] Fallback succeeded via: ${rpcUrl}`);
      }
      return result;
    } catch (err: any) {
      console.warn(`[RPC] ${rpcUrl} failed for ${label}: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Initialize provider and contracts
 */
export function initVaultService() {
  provider = new ethers.JsonRpcProvider(config.baseRpcUrl);

  vaultContract = new ethers.Contract(config.vaultAddress, VAULT_ABI, provider);
  registryContract = new ethers.Contract(config.merchantRegistryAddress, REGISTRY_ABI, provider);

  console.log(' Vault service initialized');
  console.log(`   Vault: ${config.vaultAddress}`);
  console.log(`   Registry: ${config.merchantRegistryAddress}`);
  console.log(`   Primary RPC: ${config.baseRpcUrl}`);
  console.log(`   Fallback RPCs: ${BASE_SEPOLIA_RPCS.length - 1} additional endpoints`);

  // Warm up connection in background
  provider.getBlockNumber().then(n => console.log(`   ✅ RPC connected, block: ${n}`)).catch(() => {
    console.warn('   ⚠️  Primary RPC unreachable, fallbacks will be used');
  });
}

/**
 * Get user's vault balance for a token
 */
export async function getUserBalance(user: string, token: string): Promise<VaultBalance> {
  try {
    // Parallel calls with fallback across multiple RPCs
    const [total, reserved] = await Promise.all([
      rpcWithFallback(vc => vc.getTotalDeposited(user, token), `getTotalDeposited(${user.slice(0,8)})`),
      rpcWithFallback(vc => vc.getReserved(user, token), `getReserved(${user.slice(0,8)})`),
    ]);

    const available = total - reserved;
    return {
      total: total.toString(),
      reserved: reserved.toString(),
      available: available.toString(),
    };
  } catch (error: any) {
    console.error('Error fetching user balance:', error);
    if (error.code === 'BAD_DATA' && error.value === '0x') {
      throw new Error('Failed to fetch vault balance: Contract call returned empty data (check contract address)');
    }
    throw new Error('Failed to fetch vault balance: ' + (error.message || error));
  }
}

/**
 * Get user's current nonce
 */
export async function getUserNonce(user: string): Promise<string> {
  // Serve from cache if fresh (avoids repeated RPC round-trips per request)
  const cached = nonceCache.get(user);
  if (cached && Date.now() - cached.ts < NONCE_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const nonce = await rpcWithFallback(vc => vc.nonces(user), `nonces(${user.slice(0,8)})`);
    const value = nonce.toString();
    nonceCache.set(user, { value, ts: Date.now() });
    return value;
  } catch (error: any) {
    console.error('Error fetching user nonce:', error);
    throw new Error('Failed to fetch user nonce: ' + (error.message || error));
  }
}

/**
 * Check if a session key is authorized for a user
 */
export async function isSessionKeyAuthorized(user: string, sessionKey: string): Promise<boolean> {
  try {
    const session = await rpcWithFallback(
      vc => vc.sessions(user, sessionKey), 
      `sessions(${user.slice(0,8)}, ${sessionKey.slice(0,8)})`
    );
    // session returns [limit, spent, expiry, active]
    const active = session[3];
    const expiry = Number(session[2]);
    const now = Math.floor(Date.now() / 1000);
    
    return active && expiry > now;
  } catch (error: any) {
    console.error('Error checking session key:', error);
    return false;
  }
}

/**
 * Get merchant configuration from registry
 */
export async function getMerchantConfig(merchant: string): Promise<MerchantConfig> {
  try {
    // Try each RPC in sequence for the registry contract
    let lastErr: any;
    for (const rpcUrl of BASE_SEPOLIA_RPCS) {
      try {
        const p = new ethers.JsonRpcProvider(rpcUrl);
        const rc = new ethers.Contract(config.merchantRegistryAddress, REGISTRY_ABI, p);
        const result = await withTimeout(rc.getMerchantConfig(merchant), 8_000, 'getMerchantConfig');
        return {
          enabled: result[0],
          settlement: result[1],
          maxOutstanding: result[2].toString(),
          feeBps: Number(result[3]),
          riskTier: Number(result[4]),
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  } catch (error: any) {
    console.error('Error fetching merchant config:', error);
    throw new Error('Failed to fetch merchant config: ' + (error.message || error));
  }
}

/**
 * Check if merchant is enabled
 */
export async function isMerchantEnabled(merchant: string): Promise<boolean> {
  try {
    const config = await getMerchantConfig(merchant);
    return config.enabled;
  } catch (error) {
    console.error('Error checking merchant status:', error);
    return false;
  }
}

/**
 * Get merchant's current outstanding amount
 */
export async function getMerchantOutstanding(merchant: string, token: string): Promise<string> {
  try {
    const outstanding = await rpcWithFallback(vc => vc.merchantOutstanding(merchant, token), 'merchantOutstanding');
    return outstanding.toString();
  } catch (error: any) {
    console.error('Error fetching merchant outstanding:', error);
    throw new Error('Failed to fetch merchant outstanding: ' + (error.message || error));
  }
}

/**
 * Get user's reserved amount for a specific merchant
 */
export async function getReservedForMerchant(
  user: string,
  merchant: string,
  token: string
): Promise<string> {
  try {
    const reserved = await vaultContract.reservedForMerchant(user, merchant, token);
    return reserved.toString();
  } catch (error: any) {
    console.error('Error fetching reserved for merchant:', error);
    throw new Error('Failed to fetch reserved amount: ' + (error.message || error));
  }
}

/**
 * Check if a token is supported
 */
export async function isTokenSupported(token: string): Promise<boolean> {
  try {
    return await rpcWithFallback(vc => vc.supportedTokens(token), 'supportedTokens');
  } catch (error) {
    console.error('Error checking token support:', error);
    return false; // Fail open — don't block on RPC issues
  }
}

/**
 * Authorize flash payment on-chain (requires signer)
 */
export async function authorizeFlashOnChain(
  auth: {
    user: string;
    merchant: string;
    amount: string;
    token: string;
    nonce: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
  }
): Promise<string> {
  try {
    // This requires a signer (wallet with private key)
    // For now, we'll just simulate the call to check if it would work
    const tx = await vaultContract.authorizeFlash.staticCall(auth);
    return 'simulated'; // In production, actually send the tx
  } catch (error: any) {
    console.error('Error authorizing flash:', error);
    throw new Error('Flash authorization failed on-chain: ' + (error.message || error));
  }
}

/**
 * Settle flash payments in batch (requires signer with settlement role)
 */
export async function settleBatch(
  users: string[],
  merchants: string[],
  tokens: string[],
  amounts: string[]
): Promise<string> {
  if (!config.settlementPrivateKey) {
    throw new Error('Settlement private key not configured');
  }

  try {
    const signer = new ethers.Wallet(config.settlementPrivateKey, provider);
    const vaultWithSigner = vaultContract.connect(signer) as any;

    const tx = await vaultWithSigner.settleFlashBatch(users, merchants, tokens, amounts);
    const receipt = await tx.wait();

    return receipt.hash;
  } catch (error: any) {
    console.error('Error settling batch:', error);
    throw new Error('Batch settlement failed: ' + (error.message || error));
  }
}

/**
 * Estimate gas for settlement
 */
export async function estimateSettlementGas(
  users: string[],
  merchants: string[],
  tokens: string[],
  amounts: string[]
): Promise<bigint> {
  try {
    const gas = await vaultContract.settleFlashBatch.estimateGas(users, merchants, tokens, amounts);
    return gas;
  } catch (error) {
    console.error('Error estimating gas:', error);
    return BigInt(500000); // Fallback estimate
  }
}

/**
 * Get current gas price
 */
export async function getGasPrice(): Promise<string> {
  try {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice?.toString() || '0';
  } catch (error) {
    console.error('Error fetching gas price:', error);
    return '0';
  }
}

/**
 * Check if address is valid
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}

/**
 * Get provider for direct access
 */
export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    initVaultService();
  }
  return provider;
}

/**
 * Verify a Flash authorization signature (off-chain verification)
 */
export async function verifyFlashAuth(auth: {
  user: string;
  merchant: string;
  amount: string;
  token: string;
  nonce: string;
  deadline: string;
  signature: string;
}): Promise<{ valid: boolean; reason?: string }> {
  try {
    // Get current nonce
    const currentNonce = await getUserNonce(auth.user);
    if (currentNonce !== auth.nonce) {
      return { valid: false, reason: `Invalid nonce: expected ${currentNonce}, got ${auth.nonce}` };
    }
    
    // Check deadline
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(auth.deadline) < now) {
      return { valid: false, reason: 'Signature expired' };
    }
    
    // Check available balance
    const balance = await getUserBalance(auth.user, auth.token);
    const amountBn = toBigInt(auth.amount);
    const availableBn = BigInt(balance.available);
    
    if (availableBn < amountBn) {
      return {
        valid: false,
        reason: `Insufficient balance: available ${balance.available}, needed ${auth.amount}`,
      };
    }
    
    // Verify signature matches user
    const network = await provider.getNetwork();
    const domain = {
      name: 'FlashCreditVault',  
      version: '1',
      chainId: network.chainId,
      verifyingContract: config.vaultAddress,
    };

    const types = {
      FlashAuth: [  
        { name: 'user', type: 'address' },
        { name: 'merchant', type: 'address' },
        { name: 'amount', type: 'uint256' },     
        { name: 'token', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const value = {
      user: auth.user,
      merchant: auth.merchant,
      amount: auth.amount,      
      token: auth.token,
      nonce: auth.nonce,
      deadline: auth.deadline,
    };
    
    const recoveredAddress = ethers.verifyTypedData(domain, types, value, auth.signature);
    
    if (recoveredAddress.toLowerCase() !== auth.user.toLowerCase()) {
      // Signer is not the owner (auth.user). Check if it's an authorized session key on-chain!
      try {
        const session = await vaultContract.sessions(auth.user, recoveredAddress);
        const limit = session[0];
        const spent = session[1];
        const expiry = session[2];
        const active = session[3];
        
        if (!active) {
          return { valid: false, reason: `Session not active for session key ${recoveredAddress}` };
        }
        
        const now = Math.floor(Date.now() / 1000);
        if (expiry <= BigInt(now)) {
          return { valid: false, reason: 'Session key expired' };
        }
        
        const amountBn = toBigInt(auth.amount);
        if (spent + amountBn > limit) {
          return {
            valid: false,
            reason: `Session limit exceeded: spent ${spent}, limit ${limit}, transaction ${auth.amount}`,
          };
        }
      } catch (error: any) {
        console.error('Session key verification error:', error);
        return { valid: false, reason: 'Session key verification failed on-chain: ' + error.message };
      }
    }
    
    return { valid: true };
  } catch (error: any) {
    console.error('Error verifying flash auth:', error);
    return { valid: false, reason: error.message || 'Verification failed' };
  }
}