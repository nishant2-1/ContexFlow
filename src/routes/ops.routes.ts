import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { workflowEventBus } from "../infrastructure/eventBus";
import { metricsStore } from "../infrastructure/metrics";
import { workflowRunStore } from "../infrastructure/workflowRunStore";
import { requireOpsRole } from "../middleware/opsAuth";
import { approvalService } from "../services/approval.service";
import { workflowService } from "../services/workflow.service";
import { TriggerEvent } from "../types/events";

export const opsRouter = Router();

const simulateSchema = z.object({
  source: z.enum(["slack", "discord"]).default("slack"),
  text: z.string().min(10).max(2000),
  assignee: z.string().optional(),
  deadlineIso: z.string().optional(),
  priorityHint: z.enum(["low", "medium", "high", "critical"]).optional(),
  workspaceId: z.string().optional()
});

const approvalDecisionSchema = z.object({
  reason: z.string().min(3).max(400).optional(),
  decidedBy: z.string().min(2).max(120).optional()
});

opsRouter.get("/metrics", requireOpsRole("viewer"), (_req, res) => {
  res.status(200).json(metricsStore.snapshot());
});

opsRouter.get("/runs", requireOpsRole("viewer"), async (req, res) => {
  const limit = Number(req.query.limit ?? 25);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 25;

  const records = await workflowRunStore.listPersistent(safeLimit);
  res.status(200).json({ records });
});

opsRouter.get("/approvals", requireOpsRole("viewer"), async (req, res) => {
  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  const status = statusParam === "pending" || statusParam === "approved" || statusParam === "rejected"
    ? statusParam
    : undefined;

  const limit = Number(req.query.limit ?? 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

  const approvals = await approvalService.list(status, safeLimit);
  res.status(200).json({ count: approvals.length, records: approvals });
});

opsRouter.get("/stream", requireOpsRole("viewer"), (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (typeof (res as { flushHeaders?: () => void }).flushHeaders === "function") {
    (res as { flushHeaders: () => void }).flushHeaders();
  }

  const writeEvent = (eventName: string, payload: unknown) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  writeEvent("connected", {
    at: new Date().toISOString(),
    message: "Live stream connected"
  });

  const onIngested = (event: TriggerEvent) => writeEvent("ingested", event);
  const onProcessing = (event: TriggerEvent) => writeEvent("processing", event);
  const onSucceeded = (result: unknown) => writeEvent("succeeded", result);
  const onFailed = (failure: unknown) => writeEvent("failed", failure);
  const onDuplicate = (event: TriggerEvent) => writeEvent("duplicate", event);
  const onAwaitingApproval = (approval: unknown) => writeEvent("awaiting_approval", approval);
  const onApprovalApproved = (approval: unknown) => writeEvent("approval_approved", approval);
  const onApprovalRejected = (approval: unknown) => writeEvent("approval_rejected", approval);

  workflowEventBus.onIngested(onIngested);
  workflowEventBus.onProcessing(onProcessing);
  workflowEventBus.onSucceeded(onSucceeded);
  workflowEventBus.onFailed(onFailed);
  workflowEventBus.onDuplicate(onDuplicate);
  workflowEventBus.onAwaitingApproval(onAwaitingApproval);
  workflowEventBus.onApprovalApproved(onApprovalApproved);
  workflowEventBus.onApprovalRejected(onApprovalRejected);

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    workflowEventBus.off("event.ingested", onIngested);
    workflowEventBus.off("event.processing", onProcessing);
    workflowEventBus.off("event.succeeded", onSucceeded);
    workflowEventBus.off("event.failed", onFailed);
    workflowEventBus.off("event.duplicate", onDuplicate);
    workflowEventBus.off("event.awaiting_approval", onAwaitingApproval);
    workflowEventBus.off("event.approval_approved", onApprovalApproved);
    workflowEventBus.off("event.approval_rejected", onApprovalRejected);
    res.end();
  });
});

opsRouter.post("/simulate", requireOpsRole("admin"), (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const payload = parsed.data;
  const eventId = `sim-${randomUUID()}`;
  const now = new Date().toISOString();

  const enrichedText = [
    payload.text,
    payload.assignee ? `@${payload.assignee}` : null,
    payload.deadlineIso ? `deadline ${payload.deadlineIso}` : null,
    payload.priorityHint ? `${payload.priorityHint} priority` : null
  ]
    .filter(Boolean)
    .join(" | ");

  const event: TriggerEvent = {
    eventId,
    source: payload.source,
    workspaceId: payload.workspaceId ?? (payload.source === "slack" ? "SIM-SLACK" : "SIM-DISCORD"),
    channelId: payload.source === "slack" ? "SIM-SLACK" : "SIM-DISCORD",
    threadTs: `sim-thread-${Date.now()}`,
    messageTs: `sim-msg-${Date.now()}`,
    userId: "simulator-bot",
    text: enrichedText,
    rawPayload: {
      simulated: true,
      workspaceId: payload.workspaceId,
      source: payload.source,
      text: payload.text,
      submittedAt: now
    },
    createdAt: now
  };

  workflowEventBus.emitIngested(event);

  res.status(202).json({
    ok: true,
    eventId,
    message: "Simulation accepted and queued"
  });
});

opsRouter.get("/dead-letters", requireOpsRole("viewer"), async (_req, res) => {
  const records = await deadLetterQueue.list();
  res.status(200).json({ count: records.length, records });
});

opsRouter.post("/replay/:eventId", requireOpsRole("admin"), async (req, res) => {
  const param = req.params.eventId;
  const eventId = Array.isArray(param) ? param[0] : param;

  if (!eventId) {
    res.status(400).json({ ok: false, message: "Missing event id" });
    return;
  }

  const replayed = await workflowService.replayEvent(eventId);

  if (!replayed) {
    res.status(404).json({ ok: false, message: "Dead-letter event not found" });
    return;
  }

  res.status(200).json({ ok: true, replayedEventId: eventId });
});

opsRouter.post("/approvals/:approvalId/approve", requireOpsRole("admin"), async (req, res) => {
  const param = req.params.approvalId;
  const approvalId = Array.isArray(param) ? param[0] : param;

  if (!approvalId) {
    res.status(400).json({ ok: false, message: "Missing approval id" });
    return;
  }

  const parsed = approvalDecisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const decidedBy = parsed.data.decidedBy ?? "ops-admin";
  const result = await workflowService.approveRequest(approvalId, decidedBy);

  if (!result.ok) {
    res.status(404).json({ ok: false, message: result.message });
    return;
  }

  res.status(200).json({ ok: true, approvalId, message: result.message });
});

opsRouter.post("/approvals/:approvalId/reject", requireOpsRole("admin"), async (req, res) => {
  const param = req.params.approvalId;
  const approvalId = Array.isArray(param) ? param[0] : param;

  if (!approvalId) {
    res.status(400).json({ ok: false, message: "Missing approval id" });
    return;
  }

  const parsed = approvalDecisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const reason = parsed.data.reason ?? "Rejected by reviewer";
  const decidedBy = parsed.data.decidedBy ?? "ops-admin";
  const result = await workflowService.rejectRequest(approvalId, decidedBy, reason);

  if (!result.ok) {
    res.status(404).json({ ok: false, message: result.message });
    return;
  }

  res.status(200).json({ ok: true, approvalId, message: result.message });
});
