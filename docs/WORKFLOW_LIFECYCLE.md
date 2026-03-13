# Workflow Lifecycle and Execution Guide

This document explains exactly how a single event moves through ContextFlow.

## 1. Trigger Sources

- Slack reaction trigger: white_check_mark on a message.
- Slack inline trigger: message containing #task, /todo, or [task].
- Discord inline trigger with the same patterns.
- Synthetic trigger via POST /api/simulate.

## 2. End-to-End Steps

1. Ingestion
- Webhook route receives payload.
- Signature is validated.
- Payload is normalized into TriggerEvent.

2. Event Publication
- TriggerEvent is emitted on event bus as ingested.
- Queue driver accepts event.

3. Processing
- Worker marks run as processing.
- Context service builds conversation snapshot.
- Workspace policy is resolved.

4. AI Extraction
- Extractor converts conversation text to structured task fields.
- Confidence is compared against workspace threshold.

5. Ticket Creation
- Provider resolver chooses Trello or Jira.
- Ticket is created with summary, priority, deadline, and metadata.

6. Loopback and Observability
- Slack thread reply is posted when source is Slack.
- Metrics store and run store are updated.
- SSE stream emits succeeded event.

7. Failure Handling
- If any step fails, workflow is marked failed.
- Record is added to dead-letter queue.
- Operator can replay from dead-letter endpoint.

## 3. Lifecycle Event Types

- event.ingested
- event.processing
- event.succeeded
- event.failed
- event.duplicate

These are consumed by:
- live SSE stream
- run history tracker
- metrics tracker

## 4. Replay Semantics

Replay creates a new event ID by suffixing replay timestamp.
This preserves original failure trace while allowing safe reprocessing.

## 5. Demo Mode Behavior

When MOCK_AI=true:
- extraction is deterministic and local

When MOCK_ISSUE=true:
- issue creation returns mock ticket URLs

This allows complete local or public demo without external accounts.

## 6. Operator UX Mapping

- Simulation Lab -> POST /api/simulate
- Live Event Stream -> GET /api/stream
- Recent Workflow Runs -> GET /api/runs
- Dead Letter Queue -> GET /api/dead-letters
- Replay Button -> POST /api/replay/:eventId
