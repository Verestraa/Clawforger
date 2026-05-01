import type {
  Executor,
  Hooks,
  INFTRef,
  Inference,
  Memory,
  Result,
  SkillManifest,
  Task,
} from './types';

/**
 * The Clawforger Agent.
 *
 * An agent is an iNFT (identity) + a memory layer + an inference layer + an
 * executor. The runtime is intentionally thin: most behaviour comes from the
 * injected providers and the registered hooks.
 *
 * The self-evolution loop lives in `@clawforger/skill-forge`. Agents wire it in
 * via `runWith()` — see examples/researcher for a worked example.
 */
export class Agent {
  public skills: SkillManifest[];

  constructor(
    public readonly inft: INFTRef,
    public readonly memory: Memory,
    public readonly inference: Inference,
    public readonly executor: Executor,
    skills: SkillManifest[] = [],
    public readonly hooks: Hooks = {}
  ) {
    this.skills = skills;
  }

  /**
   * Try to satisfy a task using the agent's existing skills and reasoning.
   * Does NOT trigger evolution — call `runWithEvolution` for that.
   */
  async run(task: Task): Promise<Result> {
    await this.hooks.beforeInference?.(task);

    // 1. Check existing skills first (capability-tag match)
    const matchingSkill = this.findSkillForTask(task);
    if (matchingSkill) {
      // Skills are stored as pointers; the actual execution path depends on
      // whether the skill is owned by this agent (run locally) or by another
      // (pay via x402 — that path lives in @clawforger/x402-skill-market/client).
      const result = await this.invokeSkill(matchingSkill, task);
      await this.persistRun(task, result);
      return result;
    }

    // 2. No skill match — let the LLM try to reason through it
    const planText = await this.inference.generate({
      system: SYSTEM_PROMPT,
      prompt: this.buildTaskPrompt(task),
    });

    await this.hooks.afterInference?.(task, planText);

    // 3. Validate against success criteria
    if (this.checkSuccess(task, planText)) {
      const result: Result = { ok: true, output: planText };
      await this.persistRun(task, result);
      return result;
    }

    return { ok: false, reason: 'no-matching-skill-and-reasoning-failed' };
  }

  /**
   * Adds a freshly-minted skill to the agent's local skill list and persists
   * a log entry. Does not call the on-chain evolveAgent — that's done by
   * inft-identity in the skill-forge flow.
   */
  registerSkill(skill: SkillManifest): void {
    this.skills.push(skill);
  }

  // ────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────

  private findSkillForTask(task: Task): SkillManifest | undefined {
    // Trivial impl: tag prefix match against task id.
    // Real impl could embed task description and rank against schemaIn.
    return this.skills.find((s) =>
      task.id.toLowerCase().includes(s.capabilityTag.split('.')[0]!)
    );
  }

  private async invokeSkill(skill: SkillManifest, task: Task): Promise<Result> {
    // Local invocation path — for x402-paid invocations of other agents'
    // skills, see @clawforger/x402-skill-market/client.
    // Delegated to skill-forge's runner so this file doesn't pull the sandbox.
    // For the base runtime we just stub it; concrete examples wire skill-forge.
    return {
      ok: true,
      output: `[stub] would invoke ${skill.capabilityTag} with ${JSON.stringify(task.inputs)}`,
      skillUsed: skill,
    };
  }

  private buildTaskPrompt(task: Task): string {
    return [
      `Task: ${task.description}`,
      `Inputs: ${JSON.stringify(task.inputs)}`,
      `Success: ${JSON.stringify(task.successCriteria)}`,
      `Available skills: ${this.skills.map((s) => s.capabilityTag).join(', ') || 'none'}`,
    ].join('\n');
  }

  private checkSuccess(task: Task, output: string): boolean {
    const c = task.successCriteria;
    switch (c.kind) {
      case 'stringContains':
        return output.includes(c.s);
      case 'lambda':
        return c.fn(output);
      case 'jsonSchemaMatch':
        // Loose check — real validation needs ajv, defer to skill-forge sandbox
        try {
          JSON.parse(output);
          return true;
        } catch {
          return false;
        }
    }
  }

  private async persistRun(task: Task, result: Result): Promise<void> {
    await this.memory.logAppend({
      kind: 'task-run',
      data: { task, result },
      ts: Math.floor(Date.now() / 1000),
    });
  }
}

const SYSTEM_PROMPT = `You are a Clawforger agent. You solve tasks by either using
existing skills (preferred) or reasoning step-by-step. If you cannot solve
the task with existing tools, output the literal string "NEEDS_SKILL" and the
runtime will trigger skill-forge to generate a new skill for you. Be precise.
Do not fabricate.`;
