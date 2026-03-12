import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { workflowEventBus } from "../infrastructure/eventBus";
import { metricsStore } from "../infrastructure/metrics";
import { workflowRunStore } from "../infrastructure/workflowRunStore";
import { workflowService } from "../services/workflow.service";
import { TriggerEvent } from "../types/events";

export const opsRouter = Router();

const simulateSchema = z.object({
  source: z.enum(["slack", "discord"]).default("slack"),
  text: z.string().min(10).max(2000),
  assignee: z.string().optional(),
  deadlineIso: z.string().optional(),
  priorityHint: z.enum(["low", "medium", "high", "critical"]).optional()
});

opsRouter.get("/metrics", (_req, res) => {
  res.status(200).json(metricsStore.snapshot());
});

opsRouter.get("/runs", (req, res) => {
  const limit = Number(req.query.limit ?? 25);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 25;

  res.status(200).json({ records: workflowRunStore.list(safeLimit) });
});

opsRouter.get("/stream", (req, res) => {
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

  workflowEventBus.onIngested(onIngested);
  workflowEventBus.onProcessing(onProcessing);
  workflowEventBus.onSucceeded(onSucceeded);
  workflowEventBus.onFailed(onFailed);
  workflowEventBus.onDuplicate(onDuplicate);

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
    res.end();
  });
});

opsRouter.post("/simulate", (req, res) => {
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
    channelId: payload.source === "slack" ? "SIM-SLACK" : "SIM-DISCORD",
    threadTs: `sim-thread-${Date.now()}`,
    messageTs: `sim-msg-${Date.now()}`,
    userId: "simulator-bot",
    text: enrichedText,
    rawPayload: {
      simulated: true,
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

opsRouter.get("/dead-letters", async (_req, res) => {
  const records = await deadLetterQueue.list();
  res.status(200).json({ count: records.length, records });
});

opsRouter.post("/replay/:eventId", async (req, res) => {
  const replayed = await workflowService.replayEvent(req.params.eventId);

  if (!replayed) {
    res.status(404).json({ ok: false, message: "Dead-letter event not found" });
    return;
  }

  res.status(200).json({ ok: true, replayedEventId: req.params.eventId });
});
