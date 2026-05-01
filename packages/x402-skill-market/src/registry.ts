/**
 * Skill registry helpers — read on-chain SkillRegistry and the local
 * marketplace index (in-memory for hackathon scope).
 */

import type { SkillManifest } from '@clawforger/core';

/** In-memory store for skills published by this server. */
export class LocalSkillIndex {
  private byHash = new Map<string, SkillManifest>();

  publish(skill: SkillManifest): void {
    this.byHash.set(skill.hash.toLowerCase(), skill);
  }

  get(hash: string): SkillManifest | undefined {
    return this.byHash.get(hash.toLowerCase());
  }

  all(): SkillManifest[] {
    return Array.from(this.byHash.values());
  }

  findByTag(tag: string): SkillManifest[] {
    return Array.from(this.byHash.values()).filter((s) => s.capabilityTag === tag);
  }
}
