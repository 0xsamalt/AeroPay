#!/bin/bash

API_URL="http://localhost:3001"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Testing Flash Rail Merchant Middleware                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Health check
echo "📡 Test 1: Health Check"
echo "-----------------------------------"
curl -s "$API_URL/health" | jq .
echo ""
echo ""

# Test 2: Free endpoint (should work without payment)
echo "🆓 Test 2: Free Test Endpoint"
echo "-----------------------------------"
curl -s "$API_URL/api/test" | jq .
echo ""
echo ""

# Test 3: Protected endpoint WITHOUT payment header (should return 402)
echo "🚫 Test 3: AI Text WITHOUT Payment (expect 402)"
echo "-----------------------------------"
curl -s -X POST "$API_URL/api/ai-text" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello world"}' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
echo ""
echo ""

# Test 4: Protected endpoint WITH Flash payment header (dev mode - should work)
echo "✅ Test 4: AI Text WITH Flash Payment (dev mode)"
echo "-----------------------------------"

# Create a mock Flash payment header
FLASH_HEADER=$(cat <<EOF
{
  "user": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "merchant": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "amount": "50000",
  "token": "0x0000000000000000000000000000000000000000",
  "nonce": "1",
  "deadline": "9999999999",
  "signature": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "gatewayUrl": "http://localhost:3000"
}
EOF
)

curl -s -X POST "$API_URL/api/ai-text" \
  -H "Content-Type: application/json" \
  -H "X-FLASH-PAYMENT: $(echo $FLASH_HEADER | jq -c .)" \
  -d '{"prompt": "Tell me about Flash Rail"}' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
echo ""
echo ""

# Test 5: AI Image endpoint (higher price)
echo "🖼️  Test 5: AI Image WITHOUT Payment (expect 402 with higher price)"
echo "-----------------------------------"
curl -s -X POST "$API_URL/api/ai-image" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A beautiful sunset"}' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
echo ""
echo ""

# Test 6: AI Image WITH Flash payment
echo "✅ Test 6: AI Image WITH Flash Payment"
echo "-----------------------------------"

FLASH_HEADER_IMAGE=$(cat <<EOF
{
  "user": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "merchant": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  "amount": "100000",
  "token": "0x0000000000000000000000000000000000000000",
  "nonce": "2",
  "deadline": "9999999999",
  "signature": "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "gatewayUrl": "http://localhost:3000"
}
EOF
)

curl -s -X POST "$API_URL/api/ai-image" \
  -H "Content-Type: application/json" \
  -H "X-FLASH-PAYMENT: $(echo $FLASH_HEADER_IMAGE | jq -c .)" \
  -d '{"prompt": "A beautiful sunset"}' \
  -w "\nHTTP Status: %{http_code}\n" | jq .
echo ""

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ✅ Tests Complete!                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"