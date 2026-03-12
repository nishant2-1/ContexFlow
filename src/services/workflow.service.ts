import { aiExtractor } from "../integrations/ai/extractor";
import { slackClient } from "../integrations/slack/slackClient";
import { trelloClient } from "../integrations/trello/trelloClient";
import { deadLetterQueue } from "../infrastructure/deadLetterQueue";
import { IdempotencyStore } from "../infrastructure/idempotencyStore";
import { metricsStore } from "../infrastructure/metrics";
import { TriggerEvent } from "../types/events";
import { logger } from "../utils/logger";
import { contextService } from "./context.service";

export class WorkflowService {
  private readonly idempotency = new IdempotencyStore();

  async handleTriggerEvent(event: TriggerEvent): Promise<void> {
    const startedAt = Date.now();
    metricsStore.incrementIngested();

    if (this.idempotency.isDuplicate(event.eventId)) {
      metricsStore.incrementDuplicate();
      logger.info({ eventId: event.eventId }, "Duplicate event skipped");
      return;
    }

    try {
      const conversation = await contextService.buildConversationContext(event);
      const task = await aiExtractor.extractTask(conversation);

      const card = await trelloClient.createCard({
        name: `[${task.priority.toUpperCase()}] ${task.title}`,
        due: task.deadlineIso,
        labels: [task.priority],
        desc: this.buildCardDescription(task, conversation, event)
      });

      metricsStore.incrementTickets();

      if (event.source === "slack" && event.channelId && (event.threadTs || event.messageTs)) {
        const threadTs = event.threadTs ?? event.messageTs;
        if (threadTs) {
          await slackClient.postThreadReply({
            channel: event.channelId,
            threadTs,
            text: [
              "ContextFlow created a Trello card for this thread.",
              `Card: ${card.url}`,
              `Priority: ${task.priority.toUpperCase()}`,
              `Assignee: ${task.assignee ?? "Unassigned"}`,
              `Deadline: ${task.deadlineIso ?? "Not specified"}`
            ].join("\n")
          });
        }
      }

      const latencyMs = Date.now() - startedAt;
      metricsStore.incrementProcessed(latencyMs);
      logger.info({ eventId: event.eventId, trelloCardUrl: card.url, latencyMs }, "Workflow completed");
    } catch (error) {
      metricsStore.incrementFailed();
      const reason = error instanceof Error ? error.message : "Unknown error";

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
      `- Event ID: ${event.eventId}`,
      `- Timestamp: ${event.createdAt}`,
      "",
      "Conversation Snapshot:",
      conversation.slice(0, 1800)
    ].join("\n");
  }
}

export const workflowService = new WorkflowService();
