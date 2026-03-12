import cors from "cors";
import express from "express";
import path from "node:path";
import { healthRouter } from "./routes/health.routes";
import { opsRouter } from "./routes/ops.routes";
import { webhookRouter } from "./routes/webhook.routes";
import { logger } from "./utils/logger";

export function createApp() {
  const app = express();

  app.use(cors());

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  app.use("/webhooks", express.raw({ type: "application/json" }), webhookRouter);
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", healthRouter);
  app.use("/api", opsRouter);

  app.use(express.static(path.resolve(process.cwd(), "public")));

  app.get(/.*/, (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ ok: false, error: "Internal server error" });
  });

  return app;
}
