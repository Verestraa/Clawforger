import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json';
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json';
import MUSDCAbi from '@clawforger/core/abis/MUSDC.json';

// Pinned addresses from the latest deploy on 0G Galileo testnet (chainId 16602).
// Mirror of `addresses.json` at the repo root.
export const ADDRESSES = {
  ClawforgerINFT: '0xeaC74aAD5AE551d80910AFC19537B928eEb9438A',
  SkillRegistry: '0x1fCbd3fFf244e9A77AD86bFB55BA44CE34fF3E55',
  RoyaltyVaultTemplate: '0x2C4f63bfbAd08c17bEdC37E96a503eB74b68edba',
  mUSDC: '0x96041fFF185173e2650bE8344a96c072Df036f9A',
} as const;

export const ABIS = {
  ClawforgerINFT: ClawforgerINFTAbi as readonly unknown[],
  SkillRegistry: SkillRegistryAbi as readonly unknown[],
  RoyaltyVault: RoyaltyVaultAbi as readonly unknown[],
  MUSDC: MUSDCAbi as readonly unknown[],
} as const;
