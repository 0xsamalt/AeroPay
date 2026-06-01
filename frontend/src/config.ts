export const config = {
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3000',
  merchantUrl: import.meta.env.VITE_MERCHANT_URL || 'http://localhost:3001',
  
  contracts: {
    vault: '0x94fB1E81b912e11fD2718e261EA39810C80c7471',
    registry: '0x8FD9C4015d0E4a120DEa40c063c8F8ABe75eA9A8',
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    mUSDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  
  base: {
    chainId: 84532, // Base Sepolia
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.base.org/explorer',
  },
}