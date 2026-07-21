# Sales Copilot

A Slack copilot that answers customer-success and business-operations questions by orchestrating
**Claude tool use** against a real Snowflake-backed dataset — customers, membership renewals,
AI-driven churn/health signals, location P&L, staffing/retention, and marketing performance — a
portfolio project demonstrating enterprise AI patterns: multi-turn conversational agents,
cross-system tool orchestration, structured output via tool calls, and defensive engineering
(input validation, prompt-injection awareness, rate limiting, graceful error handling).

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
Tool Registry (src/tools/) ──► Service Layer (src/data/) ──► Snowflake (snowflake-sdk)
```

- **Slack layer** knows nothing about Claude internals — it hands a normalized question to the
  orchestrator and renders back a normalized `{summary, recommendedNextActions}` result as Block
  Kit.
- **Orchestrator** owns the tool-use loop and is Slack-agnostic — it's also driven directly by the
  CLI harness (`scripts/cli.ts`) for fast local iteration without Slack.
- **Tools** are a thin, zod-validated bridge between Claude's tool calls and the service layer,
  namespaced by system: `crm_*` and `usage_*` (customer-level, keyed by numeric `customerId`);
  `location_*`, `finance_*`, `workforce_*`, and `marketing_*` (all aggregate/city-level — no
  `customerId`); an optional `analyst_*` tool (see below); plus a special `respond_finalAnswer`
  terminal tool. Names use underscores, not dots — Anthropic's API requires tool names to match
  `^[a-zA-Z0-9_-]{1,128}$`.
- **Service layer** (`src/data/`) runs parameterized SQL against a real Snowflake database
  (`AIRE_DATA.WORKFORCE_ANALYTICS`) via `src/snowflake/client.ts`, which lazily pools connections
  (`snowflake-sdk` + `generic-pool`) and wraps every driver failure as a safe, generic
  `SnowflakeQueryError` — never leaking raw connection/query error detail up to Slack.

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

### The optional `analyst_askWorkforceQuestion` tool (Cortex Analyst via MCP)

Snowflake exposes a native, Snowflake-hosted **MCP server** (`CREATE MCP SERVER`) with two tools:
`query_data` (raw SQL execution — self-flagged by Snowflake as `destructiveHint: true`, since it's
not read-only) and `aire_analyst` (Cortex Analyst, self-flagged `readOnlyHint: true`). This project
deliberately exposes **only** the safe one to Claude.

Cortex Analyst doesn't execute queries itself — it returns an interpretation of the question plus a
*proposed* SQL statement. `src/snowflake/mcpAnalystClient.ts` implements the missing half: it calls
`aire_analyst` over the MCP protocol (a plain authenticated HTTP `tools/call` JSON-RPC request, no
MCP SDK dependency needed for this single stateless call), verifies the returned statement is
`SELECT`/`WITH`-shaped (rejecting anything else as a safety check, even though Cortex Analyst is
supposed to only ever propose reads), and then executes it via the **same** `querySnowflake()`
connection already powering every other tool — so the destructive `query_data` tool is never
touched anywhere in this codebase.

This tool is **optional and additive** — it only registers when `SNOWFLAKE_MCP_ENDPOINT` is set,
and the system prompt instructs Claude to try the six fixed tool systems first, falling back to
this one only when a question genuinely falls outside their coverage.

Authentication reuses the exact same key-pair already configured for the primary Snowflake
connection (`SNOWFLAKE_PRIVATE_KEY_PATH`) — `src/snowflake/keyPairJwt.ts` builds a Snowflake
key-pair JWT from it for the MCP server's REST API, a different auth mechanism than
`snowflake-sdk`'s own internal handling, but the same underlying credential.

## Project layout

```
src/
  claude/       Anthropic SDK client, system prompt, tool-use orchestrator
  tools/        Tool registry + per-system tool definitions
                (crm/usage/location/finance/workforce/marketing/respond)
  snowflake/    Lazy connection-pooled Snowflake client + query helper
  data/         Service functions (parameterized SQL over the client above) — customer/health,
                location revenue, P&L, staffing/retention, campaign performance
  conversation/ In-memory, TTL-evicted, thread-scoped conversation history store
  slack/        Bolt app, event handlers, Block Kit formatting, dedupe + rate-limit guards
  config/       Typed, fail-fast environment loading (zod)
  logging/      Structured logging (pino)
scripts/cli.ts  REPL for talking to Claude + tools without Slack
tests/          Unit tests (service layer, Snowflake client, tools, conversation store, formatting) +
                integration tests (orchestrator tool-use loop, against a scripted fake Claude client
                and a scripted fake Snowflake client)
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `ANTHROPIC_API_KEY` — from the Anthropic Console.
- `SLACK_BOT_TOKEN` (`xoxb-...`) and `SLACK_APP_TOKEN` (`xapp-...`) — from your Slack app (see below).
- `SNOWFLAKE_*` — account identifier, username, warehouse, and either key-pair auth (recommended
  default — `SNOWFLAKE_PRIVATE_KEY_PATH`) or password auth (local-dev fallback). See the comments
  in `.env.example`. Never commit a private key file or `.env` itself.

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

The connected Snowflake database (`AIRE_DATA.WORKFORCE_ANALYTICS`) is a real spa/wellness
membership dataset, not a mock — so try any real customer by name. One good flagship example:
**Charlotte Williams** (`customerId: 1753`) — Silver tier, NPS 4, 62 days since her last visit, a
membership renewal on file marked "At Risk" (24% renewal probability), and a "High" AI-predicted
churn risk (95%). Try, in a DM or by @mentioning the bot:

1. `what's going on with Charlotte Williams?` — expect Claude to resolve the customer, fan out
   across CRM and Usage in parallel, and come back with a status summary plus Recommended Next
   Actions grounded in her actual churn-risk and renewal data.
2. `what's her recent activity?` (same thread) — tests thread-scoped memory; no need to re-mention
   her name.
3. Ask about a customer in good standing (low churn risk, healthy visit frequency) to see the
   contrast — Recommended Next Actions should be minimal or absent when nothing is urgent.
4. `what's Charlotte's email?` — a simple factual lookup; expect a plain answer with no
   Recommended Next Actions section (per the system prompt's "skip for small talk/simple lookups"
   rule).
5. Ask about a nonexistent customer, or a name matching multiple real customers — expect a
   clarifying question rather than a guess.

For business-operations questions (finance/workforce/marketing — no customer name needed):

6. `how has revenue trended month-over-month for each city over the past 12 months?` — fans out
   `location_getRevenueTrend` and should flag London as a major outlier (5-10x normal revenue).
7. `what's the profit margin trend for Denver over the last few months?` — Denver is a real
   flagship example here too: its labor costs actually exceed revenue in some months.
8. `which locations are understaffed relative to booking demand?` — try `workforce_getStaffingSummary`
   for Miami specifically; it has real bookings and recruiting spend but zero active employees.
9. `if we build another treatment room in London costing $200K, what's the payback period?` — tests
   Claude doing real arithmetic from `finance_getRevenuePerRoom`'s figures rather than refusing.
10. `which locations are forecast to hit capacity constraints first?` — `location_getBookingForecast`
    should flag London: forecast at ~8,400 bookings/month against only 5,600 monthly capacity
    (~150% of capacity) for the next 3 months straight.
11. `is there a correlation between churn risk and visit drop-off?` — `usage_getChurnCohortSummary`
    (groupBy `churnRisk`) shows real evidence: High-risk customers average 76 days since last visit
    vs. 23 for Low-risk, with NPS 3 vs. 8.4.

Since this is live data, not a frozen fixture, exact numbers (days since last visit, renewal
probability, revenue trends, etc.) will drift over time as the underlying warehouse changes.

## Testing

```bash
npm test        # unit + integration tests (vitest)
npm run typecheck
npm run lint
```

The integration suite (`tests/integration/`) drives the real tool-use loop logic against a
scripted **fake Anthropic client** and a scripted **fake Snowflake client** (`querySnowflake` is
mocked at the `src/snowflake/client.js` boundary), so control flow — parallel tool dispatch,
per-call error isolation, the `respond_finalAnswer` termination path, retry-on-invalid-input, and
the max-iteration guard — is verified without spending real API calls, hitting a live warehouse, or
depending on live model behavior. Unit tests cover the service layer's SQL-building and row-mapping
(`tests/unit/data/`), the Snowflake client's connection-pool laziness and error-wrapping
(`tests/unit/snowflake/`), the tool registry contract, conversation store (including TTL eviction
and history truncation at clean turn boundaries), Block Kit formatting, and the rate limiter.

Manual/E2E: run through the demo script above against a real dev Slack workspace + real Claude API
+ real Snowflake connection before treating a change as verified end-to-end — Slack's own event
delivery and live model behavior aren't covered by the automated suite.

## Security notes

- Secrets live only in `.env` (gitignored); `src/config/env.ts` validates required vars at startup
  and fails fast with a clear error rather than running in a half-configured state — including a
  cross-field check that the configured Snowflake auth method has its required credential set.
- Slack bot scopes are least-privilege (see setup above) — no `channels:history` or admin scopes.
- The system prompt (`src/claude/systemPrompt.ts`) explicitly instructs Claude to treat all Slack
  message text and tool output as untrusted data, never as instructions — a basic prompt-injection
  defense.
- Every tool input is zod-validated before it reaches a service function; a failing tool call is
  isolated as an `is_error` tool_result rather than crashing the turn or the process.
- Errors shown to users in Slack are a generic, safe message; full error details (including any
  Snowflake driver error) are logged server-side only (`src/logging/logger.ts`), never echoed back
  to Slack — `src/snowflake/client.ts` specifically wraps every driver failure into a
  `SnowflakeQueryError` with a generic message before it ever reaches a tool result.
- Conversation history is in-memory with a 30-minute idle TTL and is truncated at clean turn
  boundaries past 40 messages — nothing persists beyond the process lifetime.
- A per-user sliding-window rate limit (`src/slack/handlers/rateLimit.ts`) bounds how often the
  orchestrator can be invoked, to cap Anthropic API (and Snowflake query) usage from accidental
  loops or abuse.
- `npm audit` currently reports vulnerabilities only in `vitest`'s transitive dev-server dependency
  chain (`esbuild`/`vite`) — these affect a local dev server used solely by the test runner, not
  anything shipped or run in production, and fixing them requires a breaking `vitest` v4 upgrade
  that wasn't pulled in here.

## Future enhancements

Swap in real integrations for the remaining tool systems behind the same tool interface
(Salesforce, Zendesk, Google Calendar, Jira, GitHub); move conversation/audit history to a real
datastore; cloud deployment; streaming responses; multi-agent decomposition; interactive Block Kit
actions; usage analytics; transcript ingestion. See the implementation plan for details.
