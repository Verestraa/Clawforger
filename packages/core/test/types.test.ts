import { describe, expect, test } from 'bun:test';
import type { ExecutionIntent, INFTRef, SkillManifest, ZGChain } from '../src/types';
import { chainByName, getChain, zgGalileoTestnet } from '../src/chains';

describe('types', () => {
  test('ZGChain is restricted to 0G chains', () => {
    const chain: ZGChain = '0g-galileo-testnet';
    expect(chain).toBe('0g-galileo-testnet');
  });

  test('INFTRef + SkillManifest shapes are constructible', () => {
    const inft: INFTRef = {
      contractAddress: '0x0000000000000000000000000000000000000000',
      tokenId: 1n,
      chain: '0g-galileo-testnet',
    };
    const skill: SkillManifest = {
      hash: '0xabc',
      capabilityTag: 'fetch.arxiv',
      schemaIn: { type: 'object' },
      schemaOut: { type: 'object' },
      priceUSDC: 50000,
      ownerINFT: inft,
    };
    expect(skill.priceUSDC).toBe(50000);
    expect(skill.ownerINFT.tokenId).toBe(1n);
  });

  test('ExecutionIntent rejects non-0G chains at type level', () => {
    const intent: ExecutionIntent = {
      kind: 'contractCall',
      chain: '0g-galileo-testnet',
      steps: [],
    };
    expect(intent.chain).toBe('0g-galileo-testnet');
  });
});

describe('chains', () => {
  test('zgGalileoTestnet has chainId 16602', () => {
    expect(zgGalileoTestnet.id).toBe(16602);
  });

  test('chainByName covers both 0G chains', () => {
    expect(chainByName['0g-galileo-testnet'].id).toBe(16602);
    expect(chainByName['0g-aristotle']).toBeDefined();
  });

  test('getChain returns the right chain', () => {
    const c = getChain('0g-galileo-testnet');
    expect(c.name).toBe('0G Galileo Testnet');
    expect(c.testnet).toBe(true);
  });
});
