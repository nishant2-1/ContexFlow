import { randomUUID } from "node:crypto";
import { ProcessedTask } from "../types/events";
import { env } from "../config/env";
import { postgresReadModelStore } from "../infrastructure/postgresReadModelStore";
import { ApprovalRequest, ApprovalStatus, TriggerEvent } from "../types/events";

const priorityRank: Record<ProcessedTask["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export class ApprovalService {
  private readonly store = new Map<string, ApprovalRequest>();

  constructor() {
    void this.hydrateFromPostgres();
  }

  shouldRequireApproval(task: ProcessedTask): boolean {
    if (env.APPROVAL_MODE === "off") {
      return false;
    }

    if (env.APPROVAL_MODE === "always") {
      return true;
    }

    return priorityRank[task.priority] >= priorityRank[env.APPROVAL_MIN_PRIORITY];
  }

  async createPending(input: {
    event: TriggerEvent;
    task: ProcessedTask;
    conversation: string;
    issueProviderOverride: "trello" | "jira" | null;
    requestedBy?: string | null;
  }): Promise<ApprovalRequest> {
    const now = new Date().toISOString();

    const approval: ApprovalRequest = {
      approvalId: `apr-${randomUUID()}`,
      event: input.event,
      task: input.task,
      conversation: input.conversation,
      issueProviderOverride: input.issueProviderOverride,
      status: "pending",
      requestedAt: now,
      decidedAt: null,
      requestedBy: input.requestedBy ?? null,
      decidedBy: null,
      reason: null
    };

    this.store.set(approval.approvalId, approval);
    await this.persist(approval, "approval.requested");

    return approval;
  }

  async list(status?: ApprovalStatus, limit = 50): Promise<ApprovalRequest[]> {
    const persisted = await postgresReadModelStore.listApprovals(status, limit);
    if (persisted && persisted.length > 0) {
      return persisted;
    }

    return this.memoryList(status, limit);
  }

  async get(approvalId: string): Promise<ApprovalRequest | null> {
    const local = this.store.get(approvalId);
    if (local) {
      return local;
    }

    const persisted = await postgresReadModelStore.getApproval(approvalId);
    if (persisted) {
      this.store.set(approvalId, persisted);
    }

    return persisted;
  }

  async approve(approvalId: string, decidedBy: string): Promise<ApprovalRequest | null> {
    const approval = await this.get(approvalId);
    if (!approval || approval.status !== "pending") {
      return null;
    }

    const next: ApprovalRequest = {
      ...approval,
      status: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy,
      reason: null
    };

    this.store.set(approvalId, next);
    await this.persist(next, "approval.approved");

    return next;
  }

  async reject(approvalId: string, decidedBy: string, reason: string): Promise<ApprovalRequest | null> {
    const approval = await this.get(approvalId);
    if (!approval || approval.status !== "pending") {
      return null;
    }

    const next: ApprovalRequest = {
      ...approval,
      status: "rejected",
      decidedAt: new Date().toISOString(),
      decidedBy,
      reason
    };

    this.store.set(approvalId, next);
    await this.persist(next, "approval.rejected");

    return next;
  }

  private memoryList(status?: ApprovalStatus, limit = 50): ApprovalRequest[] {
    return [...this.store.values()]
      .filter((record) => (status ? record.status === status : true))
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
      .slice(0, Math.max(limit, 1));
  }

  private async persist(approval: ApprovalRequest, eventType: string): Promise<void> {
    await postgresReadModelStore.upsertApproval(approval);
    await postgresReadModelStore.appendLifecycleEvent({
      eventId: approval.event.eventId,
      source: approval.event.source,
      workspaceId: approval.event.workspaceId ?? null,
      eventType,
      payload: approval
    });
  }

  private async hydrateFromPostgres(): Promise<void> {
    const persisted = await postgresReadModelStore.listApprovals(undefined, 500);
    if (!persisted || persisted.length === 0) {
      return;
    }

    persisted.forEach((record) => {
      this.store.set(record.approvalId, record);
    });
  }
}

export const approvalService = new ApprovalService();
