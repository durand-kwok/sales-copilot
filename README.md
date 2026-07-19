# Sales Copilot

A Slack copilot that answers sales questions by orchestrating **Claude tool use** across mock
CRM, Support/Ticketing, and Product Usage systems — a portfolio project demonstrating enterprise
AI patterns: multi-turn conversational agents, cross-system tool orchestration, structured
output via tool calls, and defensive engineering (input validation, prompt-injection awareness,
rate limiting, graceful error handling).

## Architecture

```
Slack (@mentions, DMs, threads)
        │  Socket Mode (WebSocket, no public URL needed)
        ▼
Bolt App (src/slack/) ── dedupe + rate-limit guards
        │
        ▼
Conversation Orchestrator (src/claude/orchestrator.ts)
        │  Claude tool-use loop: send → tool_use? → dispatch → repeat
        ▼
Tool Registry (src/tools/) ──► Mock Service Layer (src/mocks/) ──► JSON seed data
```

- **Slack layer** knows nothing about Claude internals — it hands a normalized question to the
  orchestrator and renders back a normalized `{summary, recommendedNextActions}` result as Block
  Kit.
- **Orchestrator** owns the tool-use loop and is Slack-agnostic — it's also driven directly by the
  CLI harness (`scripts/cli.ts`) for fast local iteration without Slack.
- **Tools** are a thin, zod-validated bridge between Claude's tool calls and the mock services,
  namespaced by system: `crm_*`, `support_*`, `usage_*`, plus a special `respond_finalAnswer`
  terminal tool (see below). Names use underscores, not dots — Anthropic's API requires tool names
  to match `^[a-zA-Z0-9_-]{1,128}$`.
- **Mock services** (`src/mocks/`) simulate a real CRM, support desk, and product-analytics
  platform: async, with realistic latency and an occasional simulated failure, backed by
  interlinked JSON fixtures.

### The `respond_finalAnswer` pattern

Rather than asking Claude to end every reply with a "Recommended Next Actions" heading in free
text (fragile to parse and easy for a model to drift on), Claude delivers its answer by calling a
dedicated `respond_finalAnswer` tool with a typed schema:

```ts
{ summary: string; recommendedNextActions?: string[] } // 1-4 items, zod-validated
```

The orchestrator treats this tool call as the loop's terminal step. This makes the "next actions"
contract structurally enforced (validated by zod, not guessed from text), and lets
`src/slack/formatting.ts` render it as its own distinct Block Kit section instead of inline prose.
If Claude ever answers in plain text instead (stop_reason `end_turn`), the orchestrator falls back
to using that text as the summary with no next actions — a graceful degrade, not a crash.

## Project layout

```
src/
  claude/       Anthropic SDK client, system prompt, tool-use orchestrator
  tools/        Tool registry + per-system tool definitions (crm/support/usage/respond)
  mocks/        Mock CRM/Support/Usage services + JSON seed data + latency/failure simulation
  conversation/ In-memory, TTL-evicted, thread-scoped conversation history store
  slack/        Bolt app, event handlers, Block Kit formatting, dedupe + rate-limit guards
  config/       Typed, fail-fast environment loading (zod)
  logging/      Structured logging (pino)
scripts/cli.ts  REPL for talking to Claude + tools without Slack
tests/          Unit tests (mocks, tools, conversation store, formatting) +
                integration tests (orchestrator tool-use loop, against a scripted fake Claude client)
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `ANTHROPIC_API_KEY` — from the Anthropic Console.
- `SLACK_BOT_TOKEN` (`xoxb-...`) and `SLACK_APP_TOKEN` (`xapp-...`) — from your Slack app (see below).

### Creating the Slack app

1. Create a new app at [api.slack.com/apps](https://api.slack.com/apps) (from scratch).
2. **Socket Mode**: enable it, and generate an app-level token with the `connections:write` scope
   — this is your `SLACK_APP_TOKEN`.
3. **OAuth & Permissions**: add these bot token scopes (least privilege — nothing broader is
   needed):
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `users:read`
4. **Event Subscriptions**: enable, and subscribe to `app_mention` and `message.im` (bot events).
5. Install the app to your workspace and copy the Bot User OAuth Token (`xoxb-...`) —
   this is your `SLACK_BOT_TOKEN`.
6. Invite the bot to a channel, or just DM it directly.

### Running it

```bash
npm run cli    # talk to Claude + tools directly, no Slack needed — fastest way to iterate
npm run dev    # run the Slack bot (Socket Mode, auto-reload)
npm run build && npm start   # production build
```

## Demo script

The mock data includes a flagship account, **Acme Corp**, purpose-built to exercise cross-system
orchestration: usage trending down for 6 months straight, an open urgent SSO-outage ticket, an
unadopted AI Analytics add-on, and a renewal 6 weeks out. Try, in a DM or by @mentioning the bot:

1. `what's going on with Acme?` — expect Claude to resolve the account, fan out across CRM,
   Support, and Usage in parallel, and come back with a status summary plus Recommended Next
   Actions (declining adoption, the SSO outage, the AI Analytics upsell, an executive review).
2. `any open tickets there?` (same thread) — tests thread-scoped memory; no need to re-mention Acme.
3. `what about Globex?` — a healthy, growing account, to see the contrast (and confirm next
   actions are correctly omitted or minimal when there's nothing urgent).
4. `who's the champion at Stark?` — a simple factual lookup; expect a plain answer with no
   Recommended Next Actions section (per the system prompt's "skip for small talk/simple lookups"
   rule).
5. Ask about a nonexistent company — expect a clarifying question rather than a guess.

## Testing

```bash
npm test        # unit + integration tests (vitest)
npm run typecheck
npm run lint
```

The integration suite (`tests/integration/`) drives the real tool-use loop logic against a
scripted **fake Anthropic client**, so control flow — parallel tool dispatch, per-call error
isolation, the `respond_finalAnswer` termination path, retry-on-invalid-input, and the
max-iteration guard — is verified without spending real API calls or depending on live model
behavior. Unit tests cover the mock services, tool registry contract, conversation store
(including TTL eviction and history truncation at clean turn boundaries), Block Kit formatting,
and the rate limiter.

Manual/E2E: run through the demo script above against a real dev Slack workspace + real Claude API
before treating a change as verified end-to-end — Slack's own event delivery and live model
behavior aren't covered by the automated suite.

## Security notes

- Secrets live only in `.env` (gitignored); `src/config/env.ts` validates required vars at startup
  and fails fast with a clear error rather than running in a half-configured state.
- Slack bot scopes are least-privilege (see setup above) — no `channels:history` or admin scopes.
- The system prompt (`src/claude/systemPrompt.ts`) explicitly instructs Claude to treat all Slack
  message text and tool output as untrusted data, never as instructions — a basic prompt-injection
  defense.
- Every tool input is zod-validated before it reaches a service function; a failing tool call is
  isolated as an `is_error` tool_result rather than crashing the turn or the process.
- Errors shown to users in Slack are a generic, safe message; full error details are logged
  server-side only (`src/logging/logger.ts`), never echoed back to Slack.
- Conversation history is in-memory with a 30-minute idle TTL and is truncated at clean turn
  boundaries past 40 messages — nothing persists beyond the process lifetime.
- A per-user sliding-window rate limit (`src/slack/handlers/rateLimit.ts`) bounds how often the
  orchestrator can be invoked, to cap Anthropic API spend from accidental loops or abuse.
- `npm audit` currently reports vulnerabilities only in `vitest`'s transitive dev-server dependency
  chain (`esbuild`/`vite`) — these affect a local dev server used solely by the test runner, not
  anything shipped or run in production, and fixing them requires a breaking `vitest` v4 upgrade
  that wasn't pulled in here.

## Future enhancements

Swap the mock services for real integrations behind the same tool interface (Snowflake first,
then Salesforce, Zendesk, Google Calendar, Jira, GitHub); move conversation/audit history to a
real datastore; cloud deployment; streaming responses; multi-agent decomposition; interactive
Block Kit actions; usage analytics; transcript ingestion. See the implementation plan for details.
