# ContextFlow

AI-Powered Event-Driven Workflow for Business Communication.

ContextFlow monitors Slack/Discord events, synthesizes messy conversations into structured work using LLMs, creates Trello tickets automatically, and posts confirmation back into the source thread.

## Why This Project Stands Out

- Solves a real remote-team problem: context loss in async collaboration.
- Demonstrates senior-level backend design: event-driven pipeline, idempotency, dead-letter queue, replay, and observability.
- Uses modern AI engineering patterns: structured output, schema validation, deterministic fallback, multi-provider support.
- Includes a full-stack operations dashboard for reliability monitoring and live demos.

## Architecture

```mermaid
flowchart LR
    A[Slack/Discord Event] --> B[Webhook Ingestion]
    B --> C[Signature Verification]
    C --> D[Event Bus]
    D --> E[Context Builder]
    E --> F[LLM Extractor\nLangChain + Zod]
    F --> G[Trello Card Creator]
    G --> H[Slack Loop-back Confirmation]
    F --> I[Metrics Store]
    G --> I
    D --> J[Idempotency Guard]
    E --> K[Dead Letter Queue]
    F --> K
    G --> K
    K --> L[Replay Endpoint]
    I --> M[Ops Dashboard]
```

## Core Features

- Real-time ingestion from Slack and Discord webhook events.
- Trigger modes:
  - Emoji reaction trigger in Slack (`white_check_mark` by default).
  - Inline command trigger via `#task`, `/todo`, or `[task]`.
- Context synthesis from thread history plus triggering message.
- AI extraction with LangChain:
  - 2-sentence summary
  - assignee
  - deadline in ISO format
  - priority (`low`, `medium`, `high`, `critical`)
  - action items and confidence
- Structured validation with Zod.
- Trello card creation with due date and priority labels.
- Slack thread loop-back with generated card URL.

## Extraordinary Features Added

- In-memory idempotency protection to skip duplicate webhook events.
- Dead-letter queue persisted as JSONL (`data/dead-letter.jsonl`).
- Replay endpoint for failed events.
- Ops API (`/api/metrics`, `/api/dead-letters`, `/api/replay/:eventId`).
- Full-stack live command center at `/` with simulation lab, status intelligence, and replay controls.
- Realtime workflow stream with Server-Sent Events (`/api/stream`).
- Recent run intelligence endpoint (`/api/runs`) for operational visibility.
- Synthetic event simulator endpoint (`/api/simulate`) for demos and stress scenarios.
- Multi-provider ticketing abstraction with runtime routing (`trello` or `jira`).
- Queue-backed execution modes: inline worker or BullMQ + Redis for retries and throughput.
- Workspace policy engine with per-workspace prompt prefixes and confidence thresholds.
- Persistent run journal (`data/workflow-runs.jsonl`) for operational history.
- Ops RBAC support with viewer/admin API keys for production-safe control endpoints.
- AI provider fallback strategy:
  - OpenAI (`gpt-4o-mini`) or Gemini (`gemini-1.5-pro`) via LangChain.
  - Deterministic parser fallback for local demos and resilient behavior.
- CI pipeline with typecheck, build, and tests.
- Dockerized runtime for consistent deployment.

## Tech Stack

- Runtime: Node.js, Express, TypeScript
- AI Orchestration: LangChain, OpenAI, Google Gemini
- Validation: Zod
- Integrations: Slack Web API, Trello REST API
- Reliability: dead-letter queue, idempotency store, replay API, metrics
- Testing: Vitest, Supertest
- Deployment: Docker, GitHub Actions CI

## Local Setup

1. Clone and install:

```bash
git clone <your-repo-url>
cd ContextFlow
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Run in development mode:

```bash
npm run dev
```

4. Build and run production mode:

```bash
npm run build
npm start
```

## Required Credentials

- Slack app with scopes: `channels:history`, `chat:write`.
- Trello key/token and target list ID.
- At least one AI key:
  - `OPENAI_API_KEY`, or
  - `GOOGLE_API_KEY`.

For local demo without AI keys, keep `MOCK_AI=true` in `.env`.

## Webhook Endpoints

- Slack events: `POST /webhooks/slack/events`
- Discord events: `POST /webhooks/discord/events`

Use ngrok for local webhook testing:

```bash
ngrok http 3000
```

Then set Slack Request URL to:

```text
https://<ngrok-id>.ngrok-free.app/webhooks/slack/events
```

## Operations Endpoints

- Health: `GET /api/healthz`
- Readiness: `GET /api/readyz`
- Metrics: `GET /api/metrics`
- Runs: `GET /api/runs?limit=20`
- Live stream: `GET /api/stream`
- Dead letters: `GET /api/dead-letters`
- Replay failed event: `POST /api/replay/:eventId`
- Trigger simulated event: `POST /api/simulate`

If ops keys are configured, send one of these:

- Header: `x-api-key: <OPS_VIEWER_API_KEY or OPS_ADMIN_API_KEY>`
- For SSE stream in browser: `GET /api/stream?api_key=<key>`

## Test and Quality Commands

```bash
npm run typecheck
npm run test
npm run build
```

## Docker

```bash
docker build -t contextflow .
docker run --env-file .env -p 3000:3000 contextflow
```

## Suggested Resume / Portfolio Positioning

Use this as a “Workflow Intelligence Platform” project and highlight:

- Event-driven architecture for real-time collaboration systems.
- LLM-to-business workflow automation with schema-safe outputs.
- Reliability engineering (DLQ, replay, idempotency, metrics).
- API integration depth (Slack + Trello/Jira + AI providers).
- Full-stack ownership with backend services plus ops UI.

Interview-ready impact statements:

- Designed a provider-agnostic ticketing adapter to support Trello and Jira without changing workflow logic.
- Built policy-aware AI extraction with workspace-level confidence thresholds to reduce low-quality automation.
- Introduced queue-backed processing with retry semantics and persistent operational journaling.

## Future Extensions

- [x] Jira integration (runtime-selectable provider abstraction).
- [x] Queue-backed execution with BullMQ option.
- [x] Per-workspace prompt templates and confidence thresholds.
- [x] Role-based access for replay/ops controls.
- [ ] Full persistent event store with Postgres read models.
- [ ] Multi-region async execution with SQS/Kafka transport.
- [ ] Human-in-the-loop approval workflow before ticket creation.
