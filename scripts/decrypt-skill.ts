/**
 * Read and decrypt a forged skill artifact from local storage.
 *   bun run scripts/decrypt-skill.ts 0xHASH
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FileBackedZGStorage, decrypt, deriveKeyFromSignature } from '@clawforger/memory-0g';
import type { Hex } from 'viem';

const hash = (process.argv[2] ?? '') as Hex;
if (!hash.startsWith('0x')) {
  console.error('usage: bun run scripts/decrypt-skill.ts 0x<hash>');
  process.exit(1);
}

const memFile = resolve(
  fileURLToPath(new URL('../data/agent-memory.json', import.meta.url))
);
const storage = new FileBackedZGStorage(memFile);
const key = await deriveKeyFromSignature(process.env.DEPLOYER_PRIVATE_KEY!);
const blob = await storage.fetchBlob(hash);
const artifact = (await decrypt(key, blob)) as any;

console.log(`tag:        ${artifact.capabilityTag}`);
console.log(`reasoning:  ${artifact.reasoning}`);
console.log(`schemaIn:   ${JSON.stringify(artifact.schemaIn)}`);
console.log(`schemaOut:  ${JSON.stringify(artifact.schemaOut)}`);
console.log(`code:`);
console.log(artifact.code);
