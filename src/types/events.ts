export type SourcePlatform = "slack" | "discord";

export interface TriggerEvent {
  eventId: string;
  source: SourcePlatform;
  workspaceId?: string;
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
  ticketUrl: string;
  issueProvider: "trello" | "jira";
  task: ProcessedTask;
  source: SourcePlatform;
  latencyMs: number;
}

export type WorkflowRunStatus =
  | "ingested"
  | "processing"
  | "awaiting_approval"
  | "succeeded"
  | "failed"
  | "duplicate"
  | "rejected";

export interface WorkflowFailureEvent {
  eventId: string;
  source: SourcePlatform;
  reason: string;
  createdAt: string;
}

export interface WorkflowRunRecord {
  eventId: string;
  source: SourcePlatform;
  workspaceId: string | null;
  status: WorkflowRunStatus;
  createdAt: string;
  updatedAt: string;
  simulated: boolean;
  latencyMs: number | null;
  ticketUrl: string | null;
  issueProvider: "trello" | "jira" | null;
  priority: ProcessedTask["priority"] | null;
  summary: string | null;
  reason: string | null;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  approvalId: string;
  event: TriggerEvent;
  task: ProcessedTask;
  conversation: string;
  issueProviderOverride: "trello" | "jira" | null;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  reason: string | null;
}
