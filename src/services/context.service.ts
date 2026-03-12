import { TriggerEvent } from "../types/events";
import { slackClient } from "../integrations/slack/slackClient";

export class ContextService {
  async buildConversationContext(event: TriggerEvent): Promise<string> {
    const lines: string[] = [];

    if (event.source === "slack" && event.channelId && (event.threadTs || event.messageTs)) {
      const rootTs = event.threadTs ?? event.messageTs;
      if (rootTs) {
        const messages = await slackClient.fetchThreadMessages(event.channelId, rootTs);
        lines.push(...messages);
      }
    }

    if (event.text) {
      lines.push(event.text);
    }

    const deduped = [...new Set(lines.map((line) => line.trim()).filter(Boolean))];

    if (deduped.length === 0) {
      return "No message context available.";
    }

    return deduped.map((line, index) => `[${index + 1}] ${line}`).join("\n");
  }
}

export const contextService = new ContextService();
