export const config = {
  gatewayUrl: 'http://localhost:3000',
  newsApiUrl: 'http://localhost:3002',
  contracts: {
    vault: '0x94fB1E81b912e11fD2718e261EA39810C80c7471',
    registry: '0x8FD9C4015d0E4a120DEa40c063c8F8ABe75eA9A8',
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  base: {
    chainId: 84532, // Base Sepolia
    rpcUrl: 'https://84532.rpc.thirdweb.com',
    blockExplorer: 'https://sepolia-sandbox.basescan.org',
  },
}
