import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { IssueProviderName } from "../integrations/issues/issueProvider";

interface WorkspacePolicyConfig {
  default?: {
    promptPrefix?: string;
    minConfidence?: number;
    issueProvider?: IssueProviderName;
  };
  workspaces?: Record<
    string,
    {
      promptPrefix?: string;
      minConfidence?: number;
      issueProvider?: IssueProviderName;
    }
  >;
}

export interface ResolvedWorkspacePolicy {
  workspaceId: string;
  promptPrefix: string;
  minConfidence: number;
  issueProvider?: IssueProviderName;
}

const defaultPromptPrefix =
  "Prioritize actionable next steps, explicit ownership, and concrete delivery timeline.";

export class WorkspacePolicyService {
  private cached: WorkspacePolicyConfig | null = null;
  private lastLoadedAt = 0;

  resolve(workspaceId?: string): ResolvedWorkspacePolicy {
    const config = this.readConfig();
    const resolvedWorkspaceId = workspaceId ?? "default";
    const defaultPolicy = config.default ?? {};
    const workspacePolicy = config.workspaces?.[resolvedWorkspaceId] ?? {};

    return {
      workspaceId: resolvedWorkspaceId,
      promptPrefix: workspacePolicy.promptPrefix ?? defaultPolicy.promptPrefix ?? defaultPromptPrefix,
      minConfidence: clampConfidence(workspacePolicy.minConfidence ?? defaultPolicy.minConfidence ?? 0.55),
      issueProvider: workspacePolicy.issueProvider ?? defaultPolicy.issueProvider
    };
  }

  private readConfig(): WorkspacePolicyConfig {
    const now = Date.now();
    if (this.cached && now - this.lastLoadedAt < 10000) {
      return this.cached;
    }

    try {
      const filePath = path.resolve(process.cwd(), env.WORKSPACE_POLICY_FILE);
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as WorkspacePolicyConfig;
      this.cached = parsed;
      this.lastLoadedAt = now;
      return parsed;
    } catch (error) {
      if (!this.cached) {
        logger.debug({ error }, "Workspace policy file not found, using defaults");
      }

      this.cached = {};
      this.lastLoadedAt = now;
      return this.cached;
    }
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.55;
  }

  return Math.max(0, Math.min(1, value));
}

export const workspacePolicyService = new WorkspacePolicyService();
