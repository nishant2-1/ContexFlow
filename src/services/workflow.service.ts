import { aiExtractor } from "../integrations/ai/extractor";
import { createIssueTicket } from "../integrations/issues/issueProvider";
import { slackClient } from "../integrations/slack/slackClient";
import { env } from "../config/env";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { workflowEventBus } from "../infrastructure/eventBus";
import { IdempotencyStore } from "../infrastructure/idempotencyStore";
import { metricsStore } from "../infrastructure/metrics";
import { workflowRunStore } from "../infrastructure/workflowRunStore";
import { ApprovalRequest, ProcessedTask, TriggerEvent, WorkflowResult } from "../types/events";
import { approvalService } from "./approval.service";
import { logger } from "../utils/logger";
import { contextService } from "./context.service";
import { workspacePolicyService } from "./workspacePolicy.service";

export class WorkflowService {
  private readonly idempotency = new IdempotencyStore();

  async handleTriggerEvent(event: TriggerEvent): Promise<void> {
    const startedAt = Date.now();
    metricsStore.incrementIngested();
    workflowRunStore.markIngested(event);

    if (this.idempotency.isDuplicate(event.eventId)) {
      metricsStore.incrementDuplicate();
      workflowRunStore.markDuplicate(event.eventId);
      workflowEventBus.emitDuplicate(event);
      logger.info({ eventId: event.eventId }, "Duplicate event skipped");
      return;
    }

    try {
      workflowRunStore.markProcessing(event.eventId);
      workflowEventBus.emitProcessing(event);

      const policy = workspacePolicyService.resolve(event.workspaceId);
      const conversation = await contextService.buildConversationContext(event);
      const task = await aiExtractor.extractTask(conversation, {
        promptPrefix: policy.promptPrefix
      });

      if (task.confidence < policy.minConfidence) {
        throw new Error(
          `Confidence ${task.confidence.toFixed(2)} below workspace threshold ${policy.minConfidence.toFixed(2)}`
        );
      }

      if (approvalService.shouldRequireApproval(task)) {
        const approval = await approvalService.createPending({
          event,
          task,
          conversation,
          issueProviderOverride: policy.issueProvider ?? null,
          requestedBy: "workflow-service"
        });

        workflowRunStore.markAwaitingApproval(event.eventId, approval.approvalId);
        workflowEventBus.emitAwaitingApproval(approval);
        await this.notifyApprovalRequired(approval);

        logger.info(
          { eventId: event.eventId, approvalId: approval.approvalId, mode: env.APPROVAL_MODE },
          "Workflow paused awaiting human approval"
        );
        return;
      }

      await this.completeWorkflow({
        event,
        task,
        conversation,
        issueProviderOverride: policy.issueProvider ?? null,
        startedAt
      });
    } catch (error) {
      await this.handleFailure(event, error);
    }
  }

  async approveRequest(approvalId: string, decidedBy: string): Promise<{ ok: boolean; message: string }> {
    const approval = await approvalService.approve(approvalId, decidedBy);
    if (!approval) {
      return { ok: false, message: "Approval request not found or already decided" };
    }

    workflowEventBus.emitApprovalApproved(approval);

    try {
      await this.completeWorkflow({
        event: approval.event,
        task: approval.task,
        conversation: approval.conversation,
        issueProviderOverride: approval.issueProviderOverride,
        startedAt: Date.parse(approval.event.createdAt) || Date.now()
      });

      return { ok: true, message: `Approval ${approvalId} accepted and workflow completed` };
    } catch (error) {
      await this.handleFailure(approval.event, error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Approval execution failed"
      };
    }
  }

  async rejectRequest(
    approvalId: string,
    decidedBy: string,
    reason: string
  ): Promise<{ ok: boolean; message: string }> {
    const approval = await approvalService.reject(approvalId, decidedBy, reason);
    if (!approval) {
      return { ok: false, message: "Approval request not found or already decided" };
    }

    metricsStore.incrementFailed();
    workflowRunStore.markRejected(approval.event.eventId, reason);
    workflowEventBus.emitApprovalRejected(approval);
    await this.notifyApprovalRejected(approval);

    return { ok: true, message: `Approval ${approvalId} rejected` };
  }

  async replayEvent(eventId: string): Promise<boolean> {
    const record = await deadLetterQueue.get(eventId);
    if (!record) {
      return false;
    }

    const payload = record.payload as TriggerEvent;
    await this.handleTriggerEvent({
      ...payload,
      eventId: `${payload.eventId}-replay-${Date.now()}`,
      createdAt: new Date().toISOString()
    });

    return true;
  }

  private async completeWorkflow(input: {
    event: TriggerEvent;
    task: ProcessedTask;
    conversation: string;
    issueProviderOverride: "trello" | "jira" | null;
    startedAt: number;
  }): Promise<WorkflowResult> {
    const { event, task, conversation, issueProviderOverride, startedAt } = input;

    const ticket = await createIssueTicket(
      {
        title: `[${task.priority.toUpperCase()}] ${task.title}`,
        dueIso: task.deadlineIso,
        description: this.buildCardDescription(task, conversation, event),
        priority: task.priority
      },
      issueProviderOverride ?? undefined
    );

    metricsStore.incrementTickets();

    if (event.source === "slack" && event.channelId && (event.threadTs || event.messageTs)) {
      const threadTs = event.threadTs ?? event.messageTs;
      if (threadTs) {
        await slackClient.postThreadReply({
          channel: event.channelId,
          threadTs,
          text: [
            `ContextFlow created a ${ticket.provider.toUpperCase()} ticket for this thread.`,
            `Ticket: ${ticket.url}`,
            `Priority: ${task.priority.toUpperCase()}`,
            `Assignee: ${task.assignee ?? "Unassigned"}`,
            `Deadline: ${task.deadlineIso ?? "Not specified"}`
          ].join("\n")
        });
      }
    }

    const latencyMs = Date.now() - startedAt;
    const result: WorkflowResult = {
      eventId: event.eventId,
      ticketUrl: ticket.url,
      issueProvider: ticket.provider,
      source: event.source,
      latencyMs,
      task
    };

    metricsStore.incrementProcessed(latencyMs);
    workflowRunStore.markSucceeded(result);
    workflowEventBus.emitSucceeded(result);
    logger.info(
      { eventId: event.eventId, issueProvider: ticket.provider, ticketUrl: ticket.url, latencyMs },
      "Workflow completed"
    );

    return result;
  }

  private async notifyApprovalRequired(approval: ApprovalRequest): Promise<void> {
    const event = approval.event;
    if (event.source !== "slack" || !event.channelId || (!event.threadTs && !event.messageTs)) {
      return;
    }

    const threadTs = event.threadTs ?? event.messageTs;
    if (!threadTs) {
      return;
    }

    await slackClient.postThreadReply({
      channel: event.channelId,
      threadTs,
      text: [
        "ContextFlow paused this request for human approval.",
        `Approval ID: ${approval.approvalId}`,
        `Approve: ${env.BASE_URL}/api/approvals/${approval.approvalId}/approve`,
        `Reject: ${env.BASE_URL}/api/approvals/${approval.approvalId}/reject`
      ].join("\n")
    });
  }

  private async notifyApprovalRejected(approval: ApprovalRequest): Promise<void> {
    const event = approval.event;
    if (event.source !== "slack" || !event.channelId || (!event.threadTs && !event.messageTs)) {
      return;
    }

    const threadTs = event.threadTs ?? event.messageTs;
    if (!threadTs) {
      return;
    }

    await slackClient.postThreadReply({
      channel: event.channelId,
      threadTs,
      text: [
        "ContextFlow approval was rejected.",
        `Approval ID: ${approval.approvalId}`,
        `Reason: ${approval.reason ?? "No reason provided"}`
      ].join("\n")
    });
  }

  private async handleFailure(event: TriggerEvent, error: unknown): Promise<void> {
    metricsStore.incrementFailed();
    const reason = error instanceof Error ? error.message : "Unknown error";
    const failure = {
      eventId: event.eventId,
      source: event.source,
      reason,
      createdAt: new Date().toISOString()
    };

    workflowRunStore.markFailed(failure);
    workflowEventBus.emitFailed(failure);

    await deadLetterQueue.enqueue({
      eventId: event.eventId,
      source: event.source,
      stage: "workflow",
      reason,
      payload: event,
      createdAt: new Date().toISOString()
    });

    logger.error({ error, eventId: event.eventId }, "Workflow failed and sent to dead letter queue");
  }

  private buildCardDescription(task: {
    summary: string;
    assignee: string | null;
    deadlineIso: string | null;
    actionItems: string[];
    confidence: number;
    priority: "low" | "medium" | "high" | "critical";
  }, conversation: string, event: TriggerEvent): string {
    return [
      `Summary: ${task.summary}`,
      "",
      `Assignee: ${task.assignee ?? "Unassigned"}`,
      `Deadline: ${task.deadlineIso ?? "Not specified"}`,
      `Priority: ${task.priority}`,
      `AI Confidence: ${(task.confidence * 100).toFixed(0)}%`,
      "",
      "Action Items:",
      ...task.actionItems.map((item) => `- ${item}`),
      "",
      "Source:",
      `- Platform: ${event.source}`,
      `- Workspace: ${event.workspaceId ?? "default"}`,
      `- Event ID: ${event.eventId}`,
      `- Timestamp: ${event.createdAt}`,
      "",
      "Conversation Snapshot:",
      conversation.slice(0, 1800)
    ].join("\n");
  }
}

export const workflowService = new WorkflowService();
