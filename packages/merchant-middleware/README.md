# @flash-rail/merchant-middleware

Express middleware for accepting Flash Credit Rail payments on Cronos x402.

## Installation

```bash
npm install @flash-rail/merchant-middleware
```

## Quick Start

```typescript
import express from "express";
import { flashOr402 } from "@flash-rail/merchant-middleware";

const app = express();
app.use(express.json());

// Define your paid endpoint
app.post(
  "/api/ai-text",
  flashOr402(
    {
      merchantAddress: "0xYourMerchantAddress", // Your address in MerchantRegistry
      settlementAddress: "0xYourSettlementAddress", // Where you receive funds
      token: "0xmUSDCAddress", // mUSDC contract on Cronos
      chainId: 25, // Cronos EVM (or 388 for zkEVM)
      price: "50000", // 0.05 USDC (6 decimals)
      gatewayUrl: "https://gateway.flash-rail.xyz", // Flash Gateway URL
      description: "AI Text Generation API",
    },
    async (req, res) => {
      // This handler ONLY runs if payment is valid!
      const { prompt } = req.body;
      const result = await yourAIFunction(prompt);
      res.json({ text: result });
    }
  )
);

app.listen(3000, () => console.log("Merchant server running on :3000"));
```

## How It Works

1. **Client makes request** → Your API receives it
2. **Check for Flash payment header** → Middleware looks for `X-FLASH-PAYMENT`
3. **If Flash payment exists:**
   - Validates signature with Gateway
   - Confirms funds are reserved on-chain
   - Calls your handler immediately ✅
4. **If no Flash payment:**
   - Returns HTTP 402 with payment requirements
   - Client can retry with Flash or do on-chain payment

## API Reference

### `flashOr402(config, handler)`

Main middleware function.

**Config Options:**

```typescript
{
  merchantAddress: string;     // Your merchant address
  settlementAddress: string;   // Where to receive payments
  token: string;               // Token contract (e.g., mUSDC)
  chainId: number;             // 25 (EVM) or 388 (zkEVM)
  price: string;               // Price in token units
  gatewayUrl: string;          // Gateway for validation
  description?: string;        // Optional service description
  skipValidation?: boolean;    // Dev mode: skip validation
}
```

**Handler:**

```typescript
async (req: FlashRequest, res: Response) => {
  // req.flashPayment contains payment details
  // req.isPaidViaFlash === true
};
```

### Utility Functions

```typescript
import { getFlashUser, isPaidViaFlash } from "@flash-rail/merchant-middleware";

// Get user's address who paid
const userAddress = getFlashUser(req); // '0x...' or null

// Check if paid via Flash
if (isPaidViaFlash(req)) {
  console.log("Instant payment!");
}
```

## Testing Locally

For development, you can skip validation:

```typescript
flashOr402(
  {
    // ... config ...
    skipValidation: true, // ⚠️ DEV ONLY - accepts any Flash header
  },
  handler
);
```

## Response Formats

### 402 Payment Required (no Flash header)

```json
{
  "amount": "50000",
  "token": "0x...",
  "recipient": "0x...",
  "chainId": 25,
  "description": "AI Text Generation API"
}
```

### 402 Payment Failed (invalid Flash)

```json
{
  "error": "Flash payment validation failed",
  "reason": "Insufficient payment amount",
  "amount": "50000",
  "token": "0x...",
  "recipient": "0x...",
  "chainId": 25
}
```

## Examples

See `demos/ai-text-api` and `demos/oracle-api` for complete examples.

## License

MIT
