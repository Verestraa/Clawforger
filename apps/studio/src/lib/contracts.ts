import ClawforgerINFTAbi from '@clawforger/core/abis/ClawforgerINFT.json';
import SkillRegistryAbi from '@clawforger/core/abis/SkillRegistry.json';
import RoyaltyVaultAbi from '@clawforger/core/abis/RoyaltyVault.json';
import MUSDCAbi from '@clawforger/core/abis/MUSDC.json';

// Pinned addresses from the latest deploy on 0G Galileo testnet (chainId 16602).
// Mirror of `addresses.json` at the repo root.
export const ADDRESSES = {
  ClawforgerINFT: '0x870e8E105AD1Ffe213B525dbDEC502EC87A6a45C',
  SkillRegistry: '0x4C14e7aA621A8be324c3a23AC3e1FE7190128854',
  RoyaltyVaultTemplate: '0x36aEA86460e3544727E932D9D8c4d54814435461',
  mUSDC: '0x35b421792972023cb971622bad8Aaa89b45D9819',
} as const;

export const ABIS = {
  ClawforgerINFT: ClawforgerINFTAbi as readonly unknown[],
  SkillRegistry: SkillRegistryAbi as readonly unknown[],
  RoyaltyVault: RoyaltyVaultAbi as readonly unknown[],
  MUSDC: MUSDCAbi as readonly unknown[],
} as const;
