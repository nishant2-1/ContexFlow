import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", service: "contextflow", timestamp: new Date().toISOString() });
});

healthRouter.get("/readyz", (_req, res) => {
  res.status(200).json({ ready: true });
});
