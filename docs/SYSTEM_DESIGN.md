# ContextFlow System Design Notes

This document focuses on design decisions, scalability, reliability, and operational behavior.

## 1. Problem Statement

Teams collaborate in chat systems where intent is unstructured, but delivery systems require structured tasks. Manual transfer from conversation to ticket tracker is error-prone and slow.

ContextFlow bridges this gap by converting chat activity into validated issue records with observability and replay support.

## 2. Functional Requirements

- Ingest chat events from Slack and Discord.
- Detect actionable triggers from reactions or inline task syntax.
- Build context from conversation threads.
- Extract structured task intent with AI.
- Create issue records in Trello or Jira.
- Post completion response in source thread.
- Expose operational metrics, run history, and failure replay tools.

## 3. Non-Functional Requirements

- Reliability:
  - no duplicate ticket creation on repeated events
  - failure capture with replay path
- Observability:
  - live status transitions
  - latency and throughput metrics
- Extensibility:
  - support multiple AI and issue providers
- Security:
  - signature verification for inbound webhooks
  - RBAC for operations endpoints
- Developer Experience:
  - deterministic demo mode without paid external dependencies

## 4. Data Flow and State Transitions

### Workflow States
- ingested
- processing
- succeeded
- failed
- duplicate

### Transition Rules
- ingested -> duplicate if event ID already processed.
- ingested -> processing when queue worker starts.
- processing -> succeeded after issue creation and post-processing.
- processing -> failed on extraction, provider, or downstream failure.
- failed -> processing via replay endpoint.

## 5. Reliability Patterns

### Idempotency
- Event IDs are cached and checked prior to executing side effects.
- Prevents duplicate ticket writes under webhook retries.

### Dead Letter Queue
- Failed workflows are persisted with reason and payload.
- Operators can inspect and replay from API/UI.

### Queue Strategy
- Inline queue for low-friction local testing.
- BullMQ for production throughput and retries.

### Persistence Strategy
- JSONL local persistence for run journal and dead letters.
- In-memory fallback for serverless compatibility.
- Upgrade path to durable datastore for production scale.

## 6. Security Model

### Inbound Trust Boundary
- Webhooks are untrusted by default.
- Slack and Discord signatures are validated before payload acceptance.

### Operations Trust Boundary
- Ops endpoints support viewer/admin keys.
- Replay and mutate operations require admin-level access.

### Secret Management
- Runtime secrets are environment variables.
- Local .env is gitignored.

## 7. Scalability Considerations

### Current
- Stateless request handling for core routes.
- Local in-memory stores for rapid local operation.

### Scaling Path
- Externalize idempotency and run stores to Redis/Postgres.
- Use BullMQ with dedicated worker process.
- Add horizontal API replicas behind load balancer.

## 8. Failure Modes and Mitigations

- Invalid webhook signature:
  - Reject request with 401.
- AI extraction invalid or low confidence:
  - Fail workflow and dead-letter with reason.
- Issue provider API failure:
  - Record dead letter; expose replay.
- Duplicate webhook delivery:
  - Mark duplicate and skip side effects.

## 9. Operational Runbook (Short)

- Check health:
  - GET /api/healthz
- Inspect metrics:
  - GET /api/metrics
- Inspect failed workflows:
  - GET /api/dead-letters
- Replay a failed event:
  - POST /api/replay/:eventId
- Generate synthetic workload:
  - POST /api/simulate

## 10. Interview Talking Points

- Demonstrates full-stack ownership from webhook security to UX instrumentation.
- Shows AI integration done with guardrails, not blind text generation.
- Applies production-minded reliability patterns in a practical workflow system.
- Uses adapter architecture to support provider-level portability and policy routing.
