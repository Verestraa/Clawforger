# Blockers — async standup

This file is the only "standup" between the 5 parallel terminals. When you can't proceed because of another agent's work, file an entry here and continue your own work in the meantime. Delete the entry when resolved.

## Format

```
- [<YOUR-AGENT>] needs <thing> from [<OTHER-AGENT>] — <what you're doing in the meantime>
  filed: 2026-05-DD HH:MM
```

Example:

```
- [UI] needs SkillRegistry ABI from [CONTRACTS] — using mock at apps/studio/src/mocks/SkillRegistry.json
  filed: 2026-05-02 14:30
- [EXECUTION] needs onSkillPublish hook spec from [CORE] — building x402 paywall server in isolation against mock SkillManifest
  filed: 2026-05-02 16:15
```

## Rules

- **One line per blocker.** Read AGENTS.md if you need to understand the coordination model.
- **Always include what you're doing in the meantime.** "I'm blocked" is not enough — agents should never sit idle.
- **Delete the line when the blocker is resolved.** Don't archive, don't strikethrough — delete. The file is a live snapshot, not a log.
- **Don't @-mention.** Just write the agent name in brackets. They'll see it next time they check this file.
- **Check this file at the top of every working session.** If something here points at you, fix the upstream and notify (e.g., "Resolved: ABIs are in `packages/core/src/abis/`" — then the requester deletes their line).

## Active blockers

<!-- Append below this line. Delete entries when resolved. -->
