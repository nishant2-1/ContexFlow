import { Router } from "express";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { metricsStore } from "../infrastructure/metrics";
import { workflowService } from "../services/workflow.service";

export const opsRouter = Router();

opsRouter.get("/metrics", (_req, res) => {
  res.status(200).json(metricsStore.snapshot());
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
