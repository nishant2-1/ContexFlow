import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

type OpsRole = "viewer" | "admin";

function resolveRole(req: Request): OpsRole | null {
  const viewerKey = env.OPS_VIEWER_API_KEY;
  const adminKey = env.OPS_ADMIN_API_KEY;

  if (!viewerKey && !adminKey) {
    return "admin";
  }

  const queryKey = typeof req.query.api_key === "string" ? req.query.api_key : undefined;
  const apiKey = req.header("x-api-key") ?? queryKey;
  if (!apiKey) {
    return null;
  }

  if (adminKey && apiKey === adminKey) {
    return "admin";
  }

  if (viewerKey && apiKey === viewerKey) {
    return "viewer";
  }

  return null;
}

export function requireOpsRole(requiredRole: OpsRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = resolveRole(req);

    if (!role) {
      res.status(401).json({ ok: false, error: "Unauthorized ops request" });
      return;
    }

    if (requiredRole === "admin" && role !== "admin") {
      res.status(403).json({ ok: false, error: "Admin role required" });
      return;
    }

    next();
  };
}
