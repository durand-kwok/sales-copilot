# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # run the Slack bot locally (Socket Mode, auto-reload via tsx watch)
npm run cli               # REPL that talks to the Claude tool-use loop directly, no Slack needed
npm run build && npm start   # production build + run

npm test                  # full unit + integration suite (vitest)
npx vitest run <path>      # run a single test file, e.g. tests/unit/data/crmService.test.ts
npx vitest run -t "<name>" # run tests matching a name pattern
npm run test:watch

npm run typecheck          # tsc --noEmit
npm run lint               # eslint . --ext .ts
```

`npm run cli` is the fastest iteration loop for orchestrator/prompt/tool changes — it exercises the
real tool-use loop and real tool dispatch without needing a Slack workspace.

## Architecture

Request flow: **Slack (Bolt, Socket Mode) → orchestrator (Claude tool-use loop) → tool registry →
service layer (`src/data/`) → Snowflake**. The Slack layer (`src/slack/`) is a thin adapter — it
normalizes an incoming message, calls `runOrchestrator()`, and renders the result as Block Kit. All
the interesting logic lives in `src/claude/orchestrator.ts` and `src/tools/`.

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
no dots. Tools are namespaced with underscores (`crm_getCustomer`, `usage_getCustomerHealth`,
`respond_finalAnswer`), not dot notation. This bit us in production once already (see git history)
— don't reintroduce dots when adding tools.

### Tool registry (`src/tools/`)

`registry.ts` aggregates per-system tool arrays (`crmTools.ts`, `usageTools.ts`, `locationTools.ts`,
`financeTools.ts`, `workforceTools.ts`, `marketingTools.ts`, `analystTools.ts`, `respondTools.ts`)
into one `toolRegistry`. `crm_*`/`usage_*` are customer-level (keyed by numeric `customerId`);
`location_*`, `finance_*`, `workforce_*`, `marketing_*` are all aggregate/city-level and have no
`customerId` — the system prompt explicitly warns Claude not to conflate the two directions. There
is no `support_*` system — it was deleted during the Snowflake migration since the real data source
has no ticket/support-desk table; don't reintroduce it without a real backing table. `analyst_*`
(currently one tool, `analyst_askWorkforceQuestion`) is conditionally spread into the registry only
when `env.SNOWFLAKE_MCP_ENDPOINT` is set — see the dedicated section below before touching it. Each
`ToolDefinition` carries both a hand-written JSON `inputSchema` (sent to the Anthropic API) and a
separate zod `zodSchema` (used to validate the model's actual input before it reaches a handler) —
these are kept in sync by hand, there's no schema-generation step. `dispatchToolUseBlocks()` runs
all tool calls from one turn concurrently and converts every outcome (success, validation failure,
or handler throw) into a `tool_result` block — a single failing tool never fails the whole turn or
throws out of the dispatcher.

Adding a new tool means: add a `ToolDefinition` to the relevant `*Tools.ts` file, register it in
`registry.ts`, and update the system prompt (`src/claude/systemPrompt.ts`) if it changes when/how
Claude should combine tools across systems.

**Recurring gotchas when adding a tool over this warehouse** (all discovered against live data, not
theoretical):
- **Anchor date windows on the table's own `MAX(...)` column, never `CURRENT_DATE()`.** The
  booking/cost data is synthetic and doesn't track wall-clock time — `location_*`/`finance_*`/
  `workforce_getBookingDemandTrend` all anchor on `(SELECT MAX(BOOKING_MONTH) FROM
  SALESFORCE_BOOKINGS)` (or the equivalent column on `SAGE_LABOR_COSTS`/`GEM_RECRUITING_COSTS`),
  not on `CURRENT_DATE()`, which can silently return a partial or empty window instead.
- **`FORECAST_ATTRITION_RESULTS.CITY` is a `VARIANT`**, not plain text — it holds a JSON-encoded
  string (`"London"` with the quotes literally in the raw value). Cast it with `CITY::STRING` in
  the `SELECT`/`WHERE`/`GROUP BY` or you'll get the quoted JSON representation back, not a clean
  city name (`workforce_getRetentionRiskForecast` does this correctly — copy that pattern).
- **A location can legitimately have zero active employees while still having bookings and
  recruiting spend** (e.g. Miami: 0 active headcount, 35 terminated, yet real booking volume and
  ~$42K in recent recruiting spend). This is real data, not a join bug — don't "fix" a
  workforce query that returns zero headcount for an operating location without checking the raw
  data first.
- **Two known data gaps**, both called out in the system prompt so Claude states them rather than
  guessing: (1) no per-visit transaction log exists, only a customer-level snapshot
  (`totalVisits`/`lastVisitDate`), so "customers who repeated in the last N months" can't be
  answered precisely; (2) `marketing_getCampaignPerformance`'s `channel` (Email/SMS/Social
  Media/Push Notification) is a different dimension than `SALESFORCE_CUSTOMERS.REFERRAL_SOURCE`
  (Walk-in/TripAdvisor/Referral/Google Ads/Instagram/Email) — only "Email" overlaps, so "CAC by
  referral source" is an approximation via channel, not an exact join.
- **`FORECAST_BOOKINGS_RESULTS.CITY` is the same `VARIANT` pattern** as `FORECAST_ATTRITION_RESULTS`
  — same `CITY::STRING` cast required (`location_getBookingForecast` does this). Both forecast
  tables only extend ~3 months out, not 6 — the tool descriptions and system prompt say so
  explicitly; don't imply a longer horizon exists.
- **London is a real, load-bearing flagship example for capacity questions**: forecast at ~8,400
  bookings/month against only 5,600 monthly capacity (~150% of capacity) for 3 straight forecast
  months, per `location_getBookingForecast`. Also the revenue-trend and revenue-per-room outlier
  (5-10x every other city). Don't be surprised if this looks like a data anomaly — it's consistent
  across every tool that touches London, so treat it as a deliberate flagship scenario, not a bug,
  unless a fresh live check says otherwise.
- **`usage_getChurnCohortSummary(groupBy: 'tier')` groups by the real paid `MEMBERSHIP_TYPE`**
  (Bronze/Silver/Gold/Platinum/"None"), not the AI-computed `AI_TIER` engagement tier — these are
  different fields on the same table; don't swap them without checking which one a question
  actually means ("membership tier" = paid plan = `MEMBERSHIP_TYPE`).

### Service layer (`src/data/`) and Snowflake client (`src/snowflake/`)

`src/snowflake/client.ts` owns the connection: a `generic-pool`-backed `Pool<Connection>` from
`snowflake-sdk`, created **lazily on first query** (not at module import time) so importing this
module — including transitively, e.g. via the tool registry in a test file — never opens a real
network connection. Its one export, `querySnowflake<T>(sqlText, binds)`, wraps `snowflake-sdk`'s
callback-only `connection.execute()` in a promise and rethrows any failure as a `SnowflakeQueryError`
with a generic, safe message — the raw driver error (which can include account/host detail) is
logged server-side only, never surfaced in a tool result.

The connection is opened with `fetchAsString: ['Date']`. Without it, DATE/TIMESTAMP columns come
back as the driver's internal SfDate-like object (`getEpochSeconds()`, `toJSON()`, etc.) instead of
a plain string — every service function's row-mapping assumes a plain string, discovered the hard
way against the real warehouse. Don't drop this option.

`src/data/crmService.ts` and `src/data/usageService.ts` are thin wrappers over `querySnowflake`:
each function runs one parameterized query against `AIRE_DATA.WORKFORCE_ANALYTICS` and maps the
raw uppercase-keyed Snowflake row (e.g. `CUSTOMER_ID`, `FIRST_NAME`) into the camelCase domain types
in `src/types/index.ts`. There's no schema-generation step — if a query's `SELECT *` column list
changes, the corresponding `Raw*Row` interface and mapper in that service file need updating by
hand.

The customer flagship for demos is **Charlotte Williams** (`customerId: 1753`) — Silver tier, NPS
4, "At Risk" renewal, "High" churn risk — a real row in `CUSTOMER_TIERS_AI`/`MEMBERSHIP_RENEWALS`,
not a fixture. Because this is live data, not a frozen fixture, exact values (days since last
visit, churn probability, etc.) can drift over time — don't hardcode assumptions about her specific
numbers into tests; the unit tests in `tests/unit/data/` use synthetic rows precisely to avoid that
coupling.

### Optional Cortex Analyst fallback (`src/snowflake/mcpAnalystClient.ts`)

Separate from the direct `snowflake-sdk` connection above, there's an optional second path to
Snowflake: a Snowflake-hosted native **MCP server** object (`AIRE_LOCAL_DB.WORKFORCE_ANALYTICS.
MY_MCP_SERVER_C`) exposing two tools. Only one of them is ever called from this codebase —
`aire_analyst` (Cortex Analyst, `readOnlyHint: true`). The other, `query_data`, runs arbitrary raw
SQL and is self-flagged `destructiveHint: true`; it is intentionally never wired up here.

**Cortex Analyst proposes SQL, it does not execute it.** A `tools/call` to `aire_analyst` returns
`{ interpretation, statement }` (or just an interpretation if it needs clarification) — no rows.
`mcpAnalystClient.ts`'s `askWorkforceAnalyst()` closes that gap itself: it calls `aire_analyst` over
plain authenticated HTTP (JSON-RPC 2.0, no MCP SDK dependency — a single stateless request/response
doesn't need one), checks the returned statement is `SELECT`/`WITH`-shaped via `isSelectLike()` as a
defense-in-depth safety check, and then executes it through the **same** `querySnowflake()` used by
every other tool. `query_data` is never touched by this flow.

Auth for the MCP server's REST API is a hand-built Snowflake key-pair JWT
(`src/snowflake/keyPairJwt.ts`, `iss: "{ACCOUNT}.{USER}.SHA256:{pubkey-fingerprint}"`, RS256), a
different mechanism than `snowflake-sdk`'s own internal auth handling, but built from the same
private key file (`SNOWFLAKE_PRIVATE_KEY_PATH`) — don't create a second key pair for this.

This tool is **optional and additive**: it only registers when `env.SNOWFLAKE_MCP_ENDPOINT` is set
(see `src/config/env.ts`'s `.superRefine()`, which requires `SNOWFLAKE_JWT` auth if the endpoint is
configured), and the system prompt (`ANALYST_TOOL_SECTION` in `src/claude/systemPrompt.ts`)
instructs Claude to try the six fixed tool systems first, using this only when a question genuinely
falls outside their coverage — don't let it become the default path for questions the fixed tools
already answer.

**Cortex Analyst can silently pick a pre-aggregated view instead of the raw table, producing a
materially wrong "average."** Live-verified: asking "what's the average NPS score by city?" twice
with slightly different phrasing produced two different, both-deterministic SQL statements — one
querying `SALESFORCE_CUSTOMERS` directly (true customer-weighted average, e.g. Miami 5.75, matching
a ground-truth manual join), the other querying `AIRE_LOCAL_DB.WORKFORCE_ANALYTICS.
V_CUSTOMER_TIER_SUMMARY` with `AVG(avg_nps) GROUP BY city` (Miami 7.025) — an unweighted
average-of-per-tier-averages that overweights small high-NPS tiers relative to large low-NPS ones.
Neither call errored or returned a warning; the wrong number came back looking exactly as
confident as the right one. There's no code-level guard against this today — if you see a semantic-
view aggregate result that looks off, re-run the same question phrased more literally against the
raw table names before trusting it, and don't assume repeatability of wording preserves the query
plan.

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
against a **scripted fake Anthropic client** (`vi.mock('.../claude/client.js', ...)`) *and* a
**scripted fake Snowflake client** (`vi.mock('.../snowflake/client.js', ...)`, mocking
`querySnowflake` directly) — both via `vi.hoisted()` (required because `vi.mock` factories are
hoisted above normal `const` declarations). This verifies control flow — parallel dispatch, per-call
error isolation, the `respond_finalAnswer` termination path, retry-on-invalid-final-answer, the
max-iteration guard — through the *real* tool registry and *real* service-layer row-mapping, without
live API calls, a live warehouse connection, or dependence on real model behavior.

Service-layer unit tests (`tests/unit/data/`) mock `querySnowflake` the same way and assert on the
exact SQL/binds passed in plus the row-mapping output, given synthetic Snowflake-shaped rows.
`tests/unit/snowflake/client.test.ts` mocks the `snowflake-sdk` package itself (its default export)
to test `querySnowflake`'s error-wrapping and the connection pool's lazy-singleton behavior;
because the pool is module-level state, each test there calls `vi.resetModules()` and dynamically
re-imports the client module to avoid cross-test pool caching.

`vitest.config.ts` injects dummy `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN`/`ANTHROPIC_API_KEY`/
`SNOWFLAKE_*` via `test.env` so `src/config/env.ts`'s fail-fast validation doesn't block test runs
that never touch the real Slack, Anthropic, or Snowflake clients.
