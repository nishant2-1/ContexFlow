import { aiExtractor } from "../integrations/ai/extractor";
import { createIssueTicket } from "../integrations/issues/issueProvider";
import { slackClient } from "../integrations/slack/slackClient";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { workflowEventBus } from "../infrastructure/eventBus";
import { IdempotencyStore } from "../infrastructure/idempotencyStore";
import { metricsStore } from "../infrastructure/metrics";
import { workflowRunStore } from "../infrastructure/workflowRunStore";
import { TriggerEvent, WorkflowResult } from "../types/events";
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

      const ticket = await createIssueTicket(
        {
          title: `[${task.priority.toUpperCase()}] ${task.title}`,
          dueIso: task.deadlineIso,
          description: this.buildCardDescription(task, conversation, event),
          priority: task.priority
        },
        policy.issueProvider
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
    } catch (error) {
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
