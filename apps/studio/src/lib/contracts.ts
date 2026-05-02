import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json';
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json';
import MUSDCAbi from '@clawforger/core/abis/MUSDC.json';

// Pinned addresses from the latest deploy on 0G Galileo testnet (chainId 16602).
// Mirror of `addresses.json` at the repo root.
export const ADDRESSES = {
  ClawforgerINFT: '0xfe9163ee0a168e30c10c458c3fadf9f8566647fc',
  SkillRegistry: '0xdd8b4fbb08327367ddc61aaca5d119d7e5cedb47',
  RoyaltyVaultTemplate: '0xb1bf1fa01840a031d45152cc37bd70d8fef63b0e',
  mUSDC: '0xbabaeabce4fbb7a356b2b9e868563da74edfd5f5',
} as const;

export const ABIS = {
  ClawforgerINFT: ClawforgerINFTAbi as readonly unknown[],
  SkillRegistry: SkillRegistryAbi as readonly unknown[],
  RoyaltyVault: RoyaltyVaultAbi as readonly unknown[],
  MUSDC: MUSDCAbi as readonly unknown[],
} as const;
