import { WebClient } from "@slack/web-api";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export class SlackClient {
  private client: WebClient | null;

  constructor() {
    this.client = env.SLACK_BOT_TOKEN ? new WebClient(env.SLACK_BOT_TOKEN) : null;
  }

  async fetchThreadMessages(channel: string, threadTs: string, limit = env.MAX_MESSAGES_FOR_CONTEXT): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    try {
      const response = await this.client.conversations.replies({
        channel,
        ts: threadTs,
        limit
      });

      return (
        response.messages
          ?.map((message) => (typeof message.text === "string" ? message.text : ""))
          .filter(Boolean) ?? []
      );
    } catch (error) {
      logger.warn({ error, channel, threadTs }, "Failed to fetch Slack thread messages");
      return [];
    }
  }

  async postThreadReply(params: { channel: string; threadTs: string; text: string }): Promise<void> {
    if (!this.client) {
      return;
    }

    const { channel, threadTs, text } = params;

    try {
      await this.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text
      });
    } catch (error) {
      logger.warn({ error, channel, threadTs }, "Failed posting Slack thread reply");
    }
  }
}

export const slackClient = new SlackClient();
