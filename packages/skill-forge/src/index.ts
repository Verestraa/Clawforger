/**
 * Skill forge — self-evolution loop for Clawforger agents.
 *
 * When an agent fails a task it cannot solve, evolve():
 *   1. Asks the LLM to generate candidate skill code (TypeScript module)
 *   2. Runs the candidate in a sandbox against the task's success criteria
 *   3. On success: uploads the artifact to 0G Storage (Log), updates the
 *      iNFT's skill manifest on-chain, fires the onSkillPublish hook so the
 *      x402 marketplace can register a paywalled endpoint.
 *
 * Tries up to MAX_ATTEMPTS candidates before giving up.
 */

import type { Agent, SkillManifest, Task } from '@clawforger/core';
import { evolveAgent } from '@clawforger/inft-identity';
import type { ZGStorageClient } from '@clawforger/memory-0g';
import { encrypt } from '@clawforger/memory-0g';
import type { Hex, WalletClient } from 'viem';
import * as sandbox from './sandbox';

export interface EvolveOpts {
  agent: Agent;
  task: Task;
  signer: WalletClient;
  storage: ZGStorageClient;
  encryptionKey: CryptoKey;
  maxAttempts?: number;
  onAttempt?: (attempt: number, code: string, result: sandbox.SandboxRunResult) => void;
  /**
   * Override the LLM-suggested capability tag. Used when the caller already
   * knows what tag the new skill should be filed under (e.g. mid-chat
   * forging where the user asked for "fetch.youtube" specifically) and
   * doesn't want MockInference's fallback heuristic to override it.
   */
  forceTag?: string;
}

export interface EvolveResult {
  ok: boolean;
  skill?: SkillManifest;
  attempts: number;
  reason?: string;
  /** True if iNFT.evolveAgent metadata pointer was updated on-chain. */
  metadataUpdated?: boolean;
  /** When metadataUpdated=false, why it was skipped (e.g. NotTokenOwner). */
  metadataError?: string;
}

export async function evolve(opts: EvolveOpts): Promise<EvolveResult> {
  const maxAttempts = opts.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Generate candidate code via the agent's inference layer
    const codegen = await opts.agent.inference.generateCode({
      task: opts.task,
      existingSkills: opts.agent.skills,
      style: 'typescript-bun-isolate',
    });

    // 2. Sandbox-test
    const result = await sandbox.run({
      code: codegen.code,
      task: opts.task,
      schemaIn: codegen.schemaIn,
      schemaOut: codegen.schemaOut,
      timeoutMs: 10_000,
    });

    opts.onAttempt?.(attempt, codegen.code, result);

    if (!result.passed) continue;

    // 3. Upload artifact to 0G Storage as an encrypted blob
    const artifactBlob = await encrypt(opts.encryptionKey, {
      code: codegen.code,
      schemaIn: codegen.schemaIn,
      schemaOut: codegen.schemaOut,
      capabilityTag: codegen.suggestedTag,
      reasoning: codegen.reasoning,
      ts: Math.floor(Date.now() / 1000),
    });
    const artifactHash = await opts.storage.uploadBlob(artifactBlob);

    // 4. Build the new skill manifest
    const skill: SkillManifest = {
      hash: artifactHash,
      capabilityTag: opts.forceTag ?? codegen.suggestedTag,
      schemaIn: codegen.schemaIn,
      schemaOut: codegen.schemaOut,
      priceUSDC: 50_000, // 0.05 mUSDC default
      ownerINFT: opts.agent.inft,
    };

    // 5. Update the iNFT metadata on-chain.
    // SOFT-FAIL: only the iNFT owner can call evolveAgent. When the
    // forge runs server-side (e.g. mid-chat), the server's signer is
    // typically *not* the user's wallet — the call reverts with
    // NotTokenOwner. The skill artifact is already on 0G Storage and
    // the marketplace cares about SkillRegistry.publishSkill (step 6),
    // so we proceed even if the metadata pointer can't be updated yet.
    // A future tx signed by the actual owner can backfill the hashes.
    const newSkills = [...opts.agent.skills, skill];
    let metadataUpdated = true;
    let metadataError: string | undefined;
    try {
      await evolveAgent({
        inft: opts.agent.inft,
        newSkillManifest: newSkills,
        newMemoryRoot: artifactHash as Hex, // simplest pointer for hackathon
        signer: opts.signer,
        storage: opts.storage,
        encryptionKey: opts.encryptionKey,
      });
    } catch (err) {
      metadataUpdated = false;
      metadataError = (err as Error).message.slice(0, 200);
      console.warn(
        `[skill-forge] evolveAgent skipped (${metadataError.split('\n')[0]}) — ` +
          `proceeding with SkillRegistry publish so the marketplace still picks up the skill.`
      );
    }

    // 6. Update local cache + fire hook (Execution agent registers the x402 endpoint).
    // Runs regardless of step 5 outcome — this is what actually surfaces
    // the new skill to the marketplace + chat tool list.
    opts.agent.registerSkill(skill);
    await opts.agent.hooks.onSkillPublish?.(skill);

    return {
      ok: true,
      skill,
      attempts: attempt,
      metadataUpdated,
      metadataError,
    };
  }

  return { ok: false, attempts: maxAttempts, reason: 'no-candidate-passed-sandbox' };
}

export { sandbox };
