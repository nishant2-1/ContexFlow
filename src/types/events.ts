export type SourcePlatform = "slack" | "discord";

export interface TriggerEvent {
  eventId: string;
  source: SourcePlatform;
  channelId?: string;
  threadTs?: string;
  messageTs?: string;
  userId?: string;
  text?: string;
  reaction?: string;
  rawPayload: unknown;
  createdAt: string;
}

export interface ProcessedTask {
  title: string;
  summary: string;
  assignee: string | null;
  deadlineIso: string | null;
  priority: "low" | "medium" | "high" | "critical";
  actionItems: string[];
  confidence: number;
}

export interface WorkflowResult {
  eventId: string;
  trelloCardUrl: string;
  task: ProcessedTask;
  source: SourcePlatform;
  latencyMs: number;
}
