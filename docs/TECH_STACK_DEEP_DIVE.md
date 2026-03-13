# ContextFlow Tech Stack Deep Dive

This document explains not only which technologies are used, but why they were selected, what problems they solve, and where they are applied in the codebase.

## 1. Runtime and Language Layer

### Node.js
- Why: Strong ecosystem for API integrations, async I/O, and event-driven workflows.
- Strength used in this project:
  - Handles concurrent webhook traffic without blocking threads.
  - Integrates quickly with Slack, Trello, Jira, and AI provider SDKs.
- Applied in:
  - API server and webhook ingestion pipeline.

### TypeScript
- Why: Adds compile-time safety to message contracts, API payloads, and workflow state transitions.
- Strength used in this project:
  - Shared types across routing, orchestration, integrations, and observability.
  - Reduces runtime bugs for optional fields like assignee, deadline, and workspace policies.
- Applied in:
  - src/types/events.ts
  - src/services/workflow.service.ts
  - src/infrastructure/*

### Express 5
- Why: Minimal but flexible framework for API + webhook handling with explicit middleware control.
- Strength used in this project:
  - Fine-grained control for raw request-body signature verification.
  - Lightweight for REST, SSE, and static dashboard hosting in one process.
- Applied in:
  - src/app.ts
  - src/routes/*.ts

## 2. AI Orchestration and Validation Layer

### LangChain
- Why: Provides provider-agnostic LLM orchestration and structured extraction patterns.
- Strength used in this project:
  - Uniform extraction flow across OpenAI and Gemini.
  - Cleaner model-switching without changing workflow code.
- Applied in:
  - src/integrations/ai/extractor.ts

### OpenAI and Google Gemini
- Why: Multi-provider strategy reduces lock-in risk and increases deployment flexibility.
- Strength used in this project:
  - OpenAI path for stable extraction quality.
  - Gemini path for alternate model economics and availability.
- Applied in:
  - Environment-driven provider selection.
  - Fallback support in extraction logic.

### Zod
- Why: Guarantees structured outputs and defensive validation for untrusted payloads and model outputs.
- Strength used in this project:
  - Prevents malformed AI outputs from contaminating downstream steps.
  - Produces predictable validation errors and safer failure handling.
- Applied in:
  - src/config/env.ts
  - Route request schemas (simulate endpoint)
  - AI extraction output contracts

## 3. Integration Layer

### Slack Web API
- Why: Source-of-truth channel for team communication and final thread loopback.
- Strength used in this project:
  - Fetches thread context for richer extraction.
  - Posts completion responses into source conversation thread.
- Applied in:
  - src/integrations/slack/slackClient.ts
  - src/routes/webhook.routes.ts

### Trello API
- Why: Lightweight task backend for teams that need quick card-based execution.
- Strength used in this project:
  - Simple card creation with priority labels and due dates.
- Applied in:
  - src/integrations/trello/trelloClient.ts

### Jira API
- Why: Enterprise issue tracking path for larger delivery workflows.
- Strength used in this project:
  - Supports project-key routing and issue-type conventions.
- Applied in:
  - src/integrations/jira/jiraClient.ts

### Provider Abstraction (Trello or Jira)
- Why: Decouples orchestration from ticket destination.
- Strength used in this project:
  - Switch providers via config or workspace policy.
  - Keeps workflow orchestration unchanged when provider changes.
- Applied in:
  - src/integrations/issues/issueProvider.ts

## 4. Workflow Reliability Layer

### Event Bus Pattern
- Why: Separates ingestion, execution, and observability concerns.
- Strength used in this project:
  - Emits lifecycle events (ingested, processing, succeeded, failed, duplicate).
  - Powers SSE live stream and run store updates.
- Applied in:
  - src/infrastructure/eventBus.ts

### Idempotency Guard
- Why: Webhook systems can redeliver duplicate events; replay-safe behavior is required.
- Strength used in this project:
  - Skips duplicate event IDs to avoid duplicate ticket creation.
- Applied in:
  - src/infrastructure/idempotencyStore.ts
  - src/services/workflow.service.ts

### Dead Letter Queue + Replay
- Why: Production systems need failure isolation and controlled reprocessing.
- Strength used in this project:
  - Captures failed payloads with reason and stage.
  - Supports replay by event ID through ops endpoint.
- Applied in:
  - src/infrastructure/deadLetterQueue.ts
  - src/routes/ops.routes.ts
  - src/services/workflow.service.ts

### Queue Abstraction (Inline or BullMQ)
- Why: Enables local simplicity and scalable async execution with retries.
- Strength used in this project:
  - Inline mode for frictionless demos.
  - BullMQ mode for concurrent processing and retry policies.
- Applied in:
  - src/infrastructure/workflowQueue.ts

### Journaled Run History
- Why: Operators need run intelligence and event lifecycle visibility.
- Strength used in this project:
  - Tracks status transitions and latency.
  - Survives runtime constraints with in-memory fallback for serverless hosts.
- Applied in:
  - src/infrastructure/workflowRunStore.ts
  - src/infrastructure/workflowJournal.ts

## 5. Security and Operations Layer

### Signature Verification
- Why: Prevents forged webhook requests.
- Strength used in this project:
  - Validates Slack and Discord signatures before event acceptance.
- Applied in:
  - src/integrations/slack/slackSignature.ts
  - src/integrations/discord/discordSignature.ts

### Ops RBAC
- Why: Observability and replay endpoints should not be publicly writable in production.
- Strength used in this project:
  - Viewer/admin key separation.
  - Optional local open mode for developer velocity.
- Applied in:
  - src/middleware/opsAuth.ts

### Structured Logging
- Why: Required for diagnosis in distributed and async workflows.
- Strength used in this project:
  - Lifecycle-aware logs with event IDs and latency.
- Applied in:
  - src/utils/logger.ts

## 6. Frontend Operations Console Layer

### Dashboard Approach
- Why: Engineering users need realtime insight into automation reliability.
- Strength used in this project:
  - Live stream with Server-Sent Events.
  - Simulation lab for deterministic demos.
  - Runs table and dead-letter replay for operations.
- Applied in:
  - public/index.html

## 7. Testing and Delivery Layer

### Vitest + Supertest
- Why: Fast feedback for API behavior and regression protection.
- Strength used in this project:
  - HTTP-level validation for route and workflow behavior.
- Applied in:
  - tests/*.test.ts

### Docker
- Why: Repeatable runtime packaging across local and cloud environments.
- Strength used in this project:
  - Consistent production image with env-based configuration.
- Applied in:
  - Dockerfile

### GitHub Actions
- Why: Enforces baseline quality gates on every change.
- Strength used in this project:
  - Typecheck, build, and tests run in CI.
- Applied in:
  - .github/workflows/*

## 8. Demonstrated Engineering Depth

This project demonstrates practical depth across:
- event-driven backend architecture
- LLM orchestration and schema-safe extraction
- integration engineering across chat and issue systems
- reliability engineering with idempotency, DLQ, replay, and metrics
- operations engineering through live observability and controlled simulation
- cloud deployment trade-offs (stateful vs serverless)
