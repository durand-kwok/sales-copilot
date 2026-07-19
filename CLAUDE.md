# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # run the Slack bot locally (Socket Mode, auto-reload via tsx watch)
npm run cli               # REPL that talks to the Claude tool-use loop directly, no Slack needed
npm run build && npm start   # production build + run

npm test                  # full unit + integration suite (vitest)
npx vitest run <path>      # run a single test file, e.g. tests/unit/mocks/crmService.test.ts
npx vitest run -t "<name>" # run tests matching a name pattern
npm run test:watch

npm run typecheck          # tsc --noEmit
npm run lint               # eslint . --ext .ts
```

`npm run cli` is the fastest iteration loop for orchestrator/prompt/tool changes — it exercises the
real tool-use loop and real tool dispatch without needing a Slack workspace.

## Architecture

Request flow: **Slack (Bolt, Socket Mode) → orchestrator (Claude tool-use loop) → tool registry →
mock services → JSON fixtures**. The Slack layer (`src/slack/`) is a thin adapter — it normalizes an
incoming message, calls `runOrchestrator()`, and renders the result as Block Kit. All the
interesting logic lives in `src/claude/orchestrator.ts` and `src/tools/`.

### The tool-use loop and the `respond_finalAnswer` pattern

`src/claude/orchestrator.ts` runs a loop: call Claude → if `stop_reason === 'tool_use'`, dispatch
every requested tool call in parallel (`Promise.all`) → feed `tool_result`s back → repeat.

Claude does **not** answer in plain assistant text. It delivers its answer by calling a special
terminal tool, `respond_finalAnswer` (defined in `src/tools/respondTools.ts`), with a zod-validated
`{ summary, recommendedNextActions? }` payload. The orchestrator special-cases this tool name: as
soon as it appears among the dispatched tool calls, the loop returns immediately instead of making
another API round-trip. This is what makes "Recommended Next Actions" a structurally-validated
field instead of something parsed out of free text — `src/slack/formatting.ts` renders it as its
own distinct Block Kit section. If Claude ever answers via plain `end_turn` text instead (it
sometimes does despite instructions), the orchestrator falls back to using that text as `summary`
with no next actions — treat this as the fallback path, not the primary one, when changing behavior.

If `respond_finalAnswer`'s input fails zod validation, that failure is surfaced to Claude as a
normal `is_error` tool_result (same mechanism as any other tool), and the loop continues so Claude
can retry with corrected input — it does not throw.

**Tool name constraint**: Anthropic's API requires tool names to match `^[a-zA-Z0-9_-]{1,128}$` —
no dots. Tools are namespaced with underscores (`crm_getAccount`, `usage_getUsageTrend`,
`respond_finalAnswer`), not dot notation. This bit us in production once already (see git history)
— don't reintroduce dots when adding tools.

### Tool registry (`src/tools/`)

`registry.ts` aggregates per-system tool arrays (`crmTools.ts`, `supportTools.ts`, `usageTools.ts`,
`respondTools.ts`) into one `toolRegistry`. Each `ToolDefinition` carries both a hand-written JSON
`inputSchema` (sent to the Anthropic API) and a separate zod `zodSchema` (used to validate the
model's actual input before it reaches a handler) — these are kept in sync by hand, there's no
schema-generation step. `dispatchToolUseBlocks()` runs all tool calls from one turn concurrently and
converts every outcome (success, validation failure, or handler throw) into a `tool_result` block —
a single failing tool never fails the whole turn or throws out of the dispatcher.

Adding a new tool means: add a `ToolDefinition` to the relevant `*Tools.ts` file, register it in
`registry.ts`, and update the system prompt (`src/claude/systemPrompt.ts`) if it changes when/how
Claude should combine tools across systems.

### Mock services (`src/mocks/`)

`crmService.ts` / `supportService.ts` / `usageService.ts` read from static JSON in `src/mocks/data/`
and are wrapped in `simulate.ts`'s `simulateCall()`, which adds realistic latency and an occasional
simulated failure (`MockApiError`). The failure rate defaults to 0 automatically under the test
runner (`process.env.VITEST` check in `simulate.ts`) so unit tests are deterministic — tests that
want to exercise the error path pass an explicit `failureRate` (0 or 1) instead of relying on
randomness.

The seed data in `src/mocks/data/` is intentionally narrative, not random: "Acme Corp"
(`acc_acme`) is a flagship scenario with a declining usage trend, an open urgent SSO ticket, an
unadopted AI Analytics feature, and an upcoming renewal — built so a real cross-system briefing
naturally produces concrete, specific Recommended Next Actions. Keep this in mind before editing
that fixture data — it's load-bearing for demos, not arbitrary.

### Conversation state (`src/conversation/store.ts`)

In-memory only, keyed by `threadKey(channel, threadTs)`. Two behaviors worth knowing before
touching this file:
- **TTL eviction**: threads idle past 30 minutes are dropped (checked lazily on `get`/`set`, no timer).
- **Truncation**: histories over 40 messages are cut, but only at a "clean user turn" boundary
  (`role === 'user'` with plain string content) — never mid `tool_use`/`tool_result` pair, since
  splitting one there would produce an invalid Anthropic API request. If no clean boundary exists
  in the excess prefix, the full history is kept rather than risk corrupting state.

### Slack handlers (`src/slack/handlers/`)

`appMention.ts` and `directMessage.ts` both: dedupe on `body.event_id` (`dedupe.ts`, guards against
Slack's retry-on-slow-ack behavior), check `rateLimit.ts`'s per-user sliding window (10 req/min)
before doing any Claude work, post a "thinking" placeholder message, then replace it via
`chat.update` once `runOrchestrator()` resolves. On any thrown error, the placeholder is replaced
with a generic user-safe message — full error detail goes only to the server-side logger, never to
Slack.

## Testing approach

Integration tests (`tests/integration/`) drive the real orchestrator loop and real tool dispatch
against a **scripted fake Anthropic client**, injected via `vi.mock('.../claude/client.js', ...)`
with `vi.hoisted()` (required because `vi.mock` factories are hoisted above normal `const`
declarations). This verifies control flow — parallel dispatch, per-call error isolation, the
`respond_finalAnswer` termination path, retry-on-invalid-final-answer, the max-iteration guard —
without live API calls or dependence on real model behavior.

`vitest.config.ts` injects dummy `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`/`ANTHROPIC_API_KEY` via
`test.env` so `src/config/env.ts`'s fail-fast validation doesn't block test runs that never touch
the real Slack or Anthropic clients.
