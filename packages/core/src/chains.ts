import { defineChain } from 'viem';
import type { Chain } from 'viem';
import type { ZGChain } from './types';

/** 0G Galileo testnet (chainId 16602) — primary deployment target. */
export const zgGalileoTestnet: Chain = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: {
      name: '0G ChainScan',
      url: 'https://chainscan-galileo.0g.ai',
    },
  },
  testnet: true,
});

/** 0G Aristotle mainnet — placeholder until chainId/RPC are public. */
export const zgAristotle: Chain = defineChain({
  id: 16601, // FIXME: confirm canonical chainId for Aristotle mainnet
  name: '0G Aristotle',
  nativeCurrency: { name: '0G', symbol: '0G', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmrpc.0g.ai'] }, // FIXME: confirm
  },
  blockExplorers: {
    default: { name: '0G ChainScan', url: 'https://chainscan.0g.ai' },
  },
});

export const chainByName: Record<ZGChain, Chain> = {
  '0g-galileo-testnet': zgGalileoTestnet,
  '0g-aristotle': zgAristotle,
};

export function getChain(name: ZGChain): Chain {
  return chainByName[name];
}
