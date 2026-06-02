import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Silent News Demo',
  projectId: 'YOUR_PROJECT_ID', // Replace with a valid ID or keep for local dev
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http('https://84532.rpc.thirdweb.com'),
  },
})
