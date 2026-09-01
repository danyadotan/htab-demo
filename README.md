# HTAB — Governed Repair Operations Demo

HTAB turns repeated operational friction into a governed repair package that an authorized person and a browser agent can inspect, replay, approve, and verify together.

The first demo uses 76 days of anonymized employee-onboarding evidence. Five visible symptom families and 143 events are compressed into one or two structural fractures, then carried through a controlled workflow:

`evidence → diagnosis → Repair Pack → replay → human approval → closure proof`

## What is implemented

- Next.js App Router dashboard with loading, error, empty, mobile, and governance states.
- Server-only OpenAI integration using the Responses API and Zod Structured Outputs.
- A typed `TAB Repair Pack` containing fractures, required capability, authority, human decision, replay tests, rollback, and closure definition.
- Side-effect-free historical replay and a hard human approval checkpoint bound to a pack fingerprint.
- WebMCP imperative tools registered through `document.modelContext` so a supported browser agent can operate the current page.
- Amplitude Browser SDK 2 instrumentation for the full friction-to-closure funnel.
- Health endpoint, security headers, deterministic unit tests, and Vercel configuration.

This is a demo, not a production workflow engine. It does not connect to HRIS, ITSM, identity, vendor, or live employee systems. “Verified” in the UI is explicitly scoped to demo replay; production closure requires a live observation window.

## Local setup

Requirements: Node.js 20.9+ and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Environment variables:

| Variable | Required | Exposure | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Server only | Generates the structured Repair Pack |
| `OPENAI_MODEL` | No | Server only | Defaults to `gpt-5.4-mini` |
| `NEXT_PUBLIC_AMPLITUDE_API_KEY` | No | Browser/public | Sends the declared product events to Amplitude |

Never prefix the OpenAI key with `NEXT_PUBLIC_`. `.env.local` and all `.env*` files are ignored by Git; `.env.example` contains names only.

## WebMCP

HTAB registers these browser tools when `document.modelContext` is available:

| Tool | Effect | Gate |
| --- | --- | --- |
| `htab_get_case_state` | Read current case and gate state | Read-only |
| `htab_analyze_bottleneck` | Call OpenAI and draft a Repair Pack | Never deploys |
| `htab_run_replay` | Execute declared historical tests | Pack required; side-effect free |
| `htab_request_human_approval` | Open the exact-pack approval dialog | Agent cannot approve |
| `htab_verify_closure` | Evaluate target and guardrails | Passing replay + human approval |

WebMCP is a progressive enhancement. In Chrome local development, enable `chrome://flags/#enable-webmcp-testing`. Production support currently uses the WebMCP origin trial. The app sets `Origin-Agent-Cluster: ?1` and `Permissions-Policy: tools=(self)` for the current API requirements. Without WebMCP support, every workflow action remains available to the human operator.

## Amplitude measurement plan

The critical funnel is:

1. `Evidence Ingested`
2. `Structural Analysis Started`
3. `Repair Pack Generated`
4. `Replay Started`
5. `Replay Completed`
6. `Human Approval Requested`
7. `Repair Pack Approved`
8. `Closure Verification Started`
9. `Verified Closure Reached`

Every event includes `product`, `demo_version`, `case_id` where relevant, and the source (`human` or `webmcp`) for governed actions. `WebMCP Tool Invoked` measures agent operation separately. No ticket text, employee identity, approval rationale, or OpenAI response content is sent as an event property.

When `NEXT_PUBLIC_AMPLITUDE_API_KEY` is empty, the analytics adapter is disabled in production and logs schema-shaped events only in local development.

## OpenAI data boundary

- Calls originate only from `app/api/analyze/route.ts`.
- Input is size-limited and validated before the API call.
- Responses are parsed against `RepairPackSchema`; unstructured output is rejected.
- `store: false` is set on the Responses API request.
- The model may draft and analyze, but it cannot approve or deploy.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`GET /api/health` reports application, OpenAI configuration, and Amplitude configuration status without exposing secret values.

## Vercel deployment

Create the Vercel project, add `OPENAI_API_KEY` to Production, Preview, and Development as appropriate, optionally add `OPENAI_MODEL` and `NEXT_PUBLIC_AMPLITUDE_API_KEY`, then deploy the production target:

```bash
vercel --prod
```

The app does not include a Vercel toolbar, feedback widget, “built with” badge, or custom deployment banner. A public production deployment should be used for the demo; preview deployment protection is a Vercel project setting, not application code.

## Repository safety

Only anonymized synthetic evidence is included in `public/demo-onboarding-evidence.csv`. Do not commit employee records, tickets, transcripts, vendor credentials, OpenAI secrets, or Amplitude secrets to GitHub.


