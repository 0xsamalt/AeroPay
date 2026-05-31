# @flash-rail/client-sdk

Client SDK for Flash Credit Rail payments on Cronos x402. Makes paid API calls as easy as regular fetch, with automatic Flash payment handling.

## Installation

```bash
npm install @flash-rail/client-sdk ethers
```

## Quick Start

### Browser / React App

```typescript
import { FlashRailClient } from "@flash-rail/client-sdk";
import { BrowserProvider } from "ethers";

// 1. Setup Flash Rail Client
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const client = new FlashRailClient({
  gatewayUrl: "https://gateway.flash-rail.xyz",
  signer,
  chainId: 25, // Cronos EVM
  vaultAddress: "0xYourVaultAddress",
});

// 2. Make a paid API call (handles everything automatically)
const response = await client.fetch("https://api.example.com/ai-text", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Tell me about Cronos" }),
});

console.log(response.data); // API response
console.log(response.method); // 'FLASH' (instant payment!)
console.log(response.latency); // Request time in ms
console.log(response.paymentDetails); // Payment info
```

### Node.js / Backend

```typescript
import { FlashRailClient } from "@flash-rail/client-sdk";
import { Wallet } from "ethers";

const signer = new Wallet("your-private-key");

const client = new FlashRailClient({
  gatewayUrl: "https://gateway.flash-rail.xyz",
  signer,
  chainId: 25,
  vaultAddress: "0x...",
});

const response = await client.fetch("https://api.example.com/data");
```

## How It Works

1. **Client makes request** → `client.fetch(url, options)`
2. **If endpoint is free** → Returns data immediately
3. **If endpoint requires payment (402)**:
   - Checks your Flash Rail balance
   - Signs Flash authorization
   - Retries request with Flash payment header
   - Returns data instantly ⚡
4. **Settlement happens later** → Gateway batches and settles on-chain

## API Reference

### `FlashRailClient`

Main client class for making Flash-enabled requests.

```typescript
const client = new FlashRailClient(config);
```

**Config Options:**

```typescript
{
  gatewayUrl: string;      // Flash Gateway URL
  signer: Signer;          // ethers.js Signer
  chainId: number;         // 25 (Cronos EVM) or 388 (zkEVM)
  vaultAddress: string;    // FlashCreditVault address
  autoRetry?: boolean;     // Auto-pay with Flash (default: true)
  timeout?: number;        // Request timeout ms (default: 30000)
}
```

### `client.fetch(url, options)`

Makes a Flash-enabled HTTP request.

```typescript
const response = await client.fetch<ResponseType>(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data }),
});
```

**Returns:**

```typescript
{
  data: T,                // Response data
  ok: boolean,           // Request succeeded
  status: number,        // HTTP status code
  method: PaymentMethod, // 'FLASH' | 'FREE' | 'ONCHAIN' | 'FAILED'
  latency: number,       // Request time in ms
  paymentDetails?: {     // Present if payment was made
    amount: string,
    token: string,
    merchant: string,
    user: string,
    nonce: string,
    signature: string
  }
}
```

### Convenience Function

```typescript
import { flashFetch } from "@flash-rail/client-sdk";

// One-off request without creating client
const response = await flashFetch(url, config, options);
```

## React Hook Example

```typescript
import { FlashRailClient } from "@flash-rail/client-sdk";
import { useSigner } from "wagmi";

function useFlashFetch() {
  const { data: signer } = useSigner();

  const client = useMemo(() => {
    if (!signer) return null;

    return new FlashRailClient({
      gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL,
      signer,
      chainId: 25,
      vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS,
    });
  }, [signer]);

  const fetch = useCallback(
    async (url: string, options?: any) => {
      if (!client) throw new Error("Wallet not connected");
      return client.fetch(url, options);
    },
    [client]
  );

  return { fetch, isReady: !!client };
}

// Usage in component
function AITextDemo() {
  const { fetch } = useFlashFetch();

  const generateText = async (prompt: string) => {
    const response = await fetch("https://api.example.com/ai-text", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });

    return response.data;
  };

  // ...
}
```

## Error Handling

```typescript
import { FlashRailError, FlashErrorCode } from "@flash-rail/client-sdk";

try {
  const response = await client.fetch(url);
} catch (error) {
  if (error instanceof FlashRailError) {
    switch (error.code) {
      case FlashErrorCode.INSUFFICIENT_BALANCE:
        console.log("Please deposit more funds");
        break;
      case FlashErrorCode.SIGNATURE_FAILED:
        console.log("User rejected signature");
        break;
      case FlashErrorCode.TIMEOUT:
        console.log("Request timed out");
        break;
      default:
        console.log("Error:", error.message);
    }
  }
}
```

## Configuration

### Disable Auto-Retry

To handle 402 responses manually:

```typescript
const client = new FlashRailClient({
  // ... config ...
  autoRetry: false, // Don't automatically pay with Flash
});

const response = await client.fetch(url);

if (response.status === 402) {
  // Handle payment requirement yourself
  console.log("Payment required:", response.data);
}
```

### Custom Timeout

```typescript
const client = new FlashRailClient({
  // ... config ...
  timeout: 60000, // 60 seconds
});
```

## Examples

See complete examples in:

- `/frontend` - React app with Flash Rail
- `/demos/test-client` - Simple Node.js client

## Requirements

- ethers.js v6+
- Web3 wallet (MetaMask, WalletConnect, etc.) for browser
- Private key or mnemonic for Node.js

## License

MIT
