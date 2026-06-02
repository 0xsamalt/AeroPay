import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { Wallet, parseUnits } from 'ethers';
import { Signer } from '@flash-rail/client-sdk';
import { config } from '../config';

// Custom Signer wrapping the ephemeral session key
export class SessionKeySigner implements Signer {
  private primaryAddress: string;
  private sessionWallet: Wallet;

  constructor(primaryAddress: string, sessionPrivateKey: string) {
    this.primaryAddress = primaryAddress;
    this.sessionWallet = new Wallet(sessionPrivateKey);
  }

  async getAddress(): Promise<string> {
    return this.primaryAddress;
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    return this.sessionWallet.signTypedData(domain, types, value);
  }

  getSessionAddress(): string {
    return this.sessionWallet.address;
  }
}

const VAULT_SESSION_ABI = [
  {
    name: 'sessions',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'sessionKey', type: 'address' },
    ],
    outputs: [
      { name: 'limit', type: 'uint256' },
      { name: 'spent', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    name: 'authorizeSessionKey',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionKey', type: 'address' },
      { name: 'limit', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'revokeSessionKey',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionKey', type: 'address' }],
    outputs: [],
  },
] as const;

export function useSessionKey() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [sessionPrivateKey, setSessionPrivateKey] = useState<string | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // Load key from localStorage
  useEffect(() => {
    if (!address) {
      setSessionPrivateKey(null);
      setSessionAddress(null);
      return;
    }

    const savedKey = localStorage.getItem(`flash_rail_session_privkey_${address.toLowerCase()}`);
    if (savedKey) {
      try {
        const wallet = new Wallet(savedKey);
        setSessionPrivateKey(savedKey);
        setSessionAddress(wallet.address);
      } catch (e) {
        console.error('Failed to load session key from localStorage', e);
        localStorage.removeItem(`flash_rail_session_privkey_${address.toLowerCase()}`);
      }
    } else {
      setSessionPrivateKey(null);
      setSessionAddress(null);
    }
  }, [address]);

  // Read session state from the vault contract
  const { data: sessionData, refetch: refetchSessionState } = useReadContract({
    address: config.contracts.vault as `0x${string}`,
    abi: VAULT_SESSION_ABI,
    functionName: 'sessions',
    args: address && sessionAddress ? [address as `0x${string}`, sessionAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!address && !!sessionAddress,
    },
  });

  const onChainLimit = sessionData ? sessionData[0] : 0n;
  const onChainSpent = sessionData ? sessionData[1] : 0n;
  const onChainExpiry = sessionData ? sessionData[2] : 0n;
  const onChainActive = sessionData ? sessionData[3] : false;

  const isExpired = onChainExpiry > 0n && BigInt(Math.floor(Date.now() / 1000)) >= onChainExpiry;
  const isActive = onChainActive && !isExpired;

  // Authorize session key
  const authorizeSession = useCallback(
    async (limitUSDC: string, expiryDays: number = 7) => {
      if (!address || !publicClient) throw new Error('Wallet not connected');

      setIsAuthorizing(true);
      try {
        const newWallet = Wallet.createRandom();
        const privKey = newWallet.privateKey;
        const pubAddress = newWallet.address;

        const limitWei = parseUnits(limitUSDC, 6);
        const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60);

        const txHash = await writeContractAsync({
          address: config.contracts.vault as `0x${string}`,
          abi: VAULT_SESSION_ABI,
          functionName: 'authorizeSessionKey',
          args: [pubAddress as `0x${string}`, limitWei, expiryTimestamp],
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash });

        localStorage.setItem(`flash_rail_session_privkey_${address.toLowerCase()}`, privKey);
        setSessionPrivateKey(privKey);
        setSessionAddress(pubAddress);

        await refetchSessionState();
        return pubAddress;
      } catch (err: any) {
        console.error('Failed to authorize session key:', err);
        throw err;
      } finally {
        setIsAuthorizing(false);
      }
    },
    [address, publicClient, writeContractAsync, refetchSessionState]
  );

  // Revoke session key
  const revokeSession = useCallback(async () => {
    if (!address || !sessionAddress || !publicClient) throw new Error('No active session key to revoke');

    setIsRevoking(true);
    try {
      const txHash = await writeContractAsync({
        address: config.contracts.vault as `0x${string}`,
        abi: VAULT_SESSION_ABI,
        functionName: 'revokeSessionKey',
        args: [sessionAddress as `0x${string}`],
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });

      localStorage.removeItem(`flash_rail_session_privkey_${address.toLowerCase()}`);
      setSessionPrivateKey(null);
      setSessionAddress(null);

      await refetchSessionState();
    } catch (err: any) {
      console.error('Failed to revoke session key:', err);
      throw err;
    } finally {
      setIsRevoking(false);
    }
  }, [address, sessionAddress, publicClient, writeContractAsync, refetchSessionState]);

  const getClientSigner = useCallback(() => {
    if (!address || !sessionPrivateKey) return null;
    return new SessionKeySigner(address, sessionPrivateKey);
  }, [address, sessionPrivateKey]);

  return {
    sessionPrivateKey,
    sessionAddress,
    isActive,
    onChainLimit,
    onChainSpent,
    onChainExpiry,
    onChainActive,
    isExpired,
    isAuthorizing,
    isRevoking,
    authorizeSession,
    revokeSession,
    getClientSigner,
    refetchSessionState,
  };
}
