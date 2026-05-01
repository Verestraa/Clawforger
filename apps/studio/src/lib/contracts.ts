import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json';
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json';
import MUSDCAbi from '@clawforger/core/abis/MUSDC.json';

// Pinned addresses from the Day-1 deploy on 0G Galileo testnet (chainId 16602).
// Mirror of `addresses.json` at the repo root.
export const ADDRESSES = {
  ClawforgerINFT: '0x6515c5bca93765e20267f8325534A027Fb1B774b',
  SkillRegistry: '0xc27E78fEe0816270Fc9AC2B5DCe748149439325c',
  RoyaltyVaultTemplate: '0x2B1045fd9273550996CA51338b85dA12a0Ca7A30',
  mUSDC: '0x9Fcc04937f05fab7EAd66c79AE1404ce2477A9A3',
} as const;

export const ABIS = {
  ClawforgerINFT: ClawforgerINFTAbi as readonly unknown[],
  SkillRegistry: SkillRegistryAbi as readonly unknown[],
  RoyaltyVault: RoyaltyVaultAbi as readonly unknown[],
  MUSDC: MUSDCAbi as readonly unknown[],
} as const;
