import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

export const zgGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: { default: { http: ['https://evmrpc-testnet.0g.ai'] } },
  blockExplorers: {
    default: { name: '0G ChainScan', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: 'Clawforger Studio',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? 'clawforger-dev',
  chains: [zgGalileo],
  ssr: false,
});
