import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env";
import { workflowEventBus } from "../infrastructure/eventBus";
import { verifyDiscordSignature } from "../integrations/discord/discordSignature";
import { verifySlackSignature } from "../integrations/slack/slackSignature";
import { TriggerEvent } from "../types/events";

export const webhookRouter = Router();

webhookRouter.post("/slack/events", async (req, res) => {
  if (!env.ENABLE_SLACK) {
    res.status(202).json({ ok: true, ignored: "Slack ingestion disabled" });
    return;
  }

  const rawBody = bufferToString(req.body);
  const timestamp = req.header("x-slack-request-timestamp");
  const signature = req.header("x-slack-signature");

  if (!verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp: timestamp ?? undefined,
    signature: signature ?? undefined,
    rawBody
  })) {
    res.status(401).json({ ok: false, error: "Invalid Slack signature" });
    return;
  }

  const payload = safeJsonParse(rawBody);
  if (!payload) {
    res.status(400).json({ ok: false, error: "Invalid JSON payload" });
    return;
  }

  if (payload.type === "url_verification" && payload.challenge) {
    res.status(200).send(payload.challenge);
    return;
  }

  if (payload.type !== "event_callback" || !payload.event) {
    res.status(202).json({ ok: true, ignored: "Unsupported Slack event type" });
    return;
  }

  const trigger = toSlackTrigger(payload);
  if (!trigger) {
    res.status(202).json({ ok: true, ignored: "No valid trigger found" });
    return;
  }

  workflowEventBus.emitIngested(trigger);
  res.status(202).json({ ok: true, eventId: trigger.eventId });
});

webhookRouter.post("/discord/events", (req, res) => {
  if (!env.ENABLE_DISCORD) {
    res.status(202).json({ ok: true, ignored: "Discord ingestion disabled" });
    return;
  }

  const rawBody = bufferToString(req.body);
  const signature = req.header("x-discord-signature") ?? undefined;

  if (!verifyDiscordSignature({
    secret: env.DISCORD_WEBHOOK_SECRET,
    rawBody,
    signature
  })) {
    res.status(401).json({ ok: false, error: "Invalid Discord signature" });
    return;
  }

  const payload = safeJsonParse(rawBody);
  if (!payload) {
    res.status(400).json({ ok: false, error: "Invalid JSON payload" });
    return;
  }

  const trigger = toDiscordTrigger(payload);
  if (!trigger) {
    res.status(202).json({ ok: true, ignored: "No valid trigger found" });
    return;
  }

  workflowEventBus.emitIngested(trigger);
  res.status(202).json({ ok: true, eventId: trigger.eventId });
});

function toSlackTrigger(payload: Record<string, any>): TriggerEvent | null {
  const event = payload.event;

  if (
    event.type === "reaction_added" &&
    event.reaction === env.REQUIRED_REACTION &&
    event.item?.type === "message"
  ) {
    return {
      eventId: payload.event_id ?? randomUUID(),
      source: "slack",
      workspaceId: payload.team_id ?? env.SLACK_WORKSPACE_ID,
      channelId: event.item.channel,
      threadTs: event.item.ts,
      messageTs: event.item.ts,
      userId: event.user,
      text: `Reaction trigger: ${event.reaction}`,
      reaction: event.reaction,
      rawPayload: payload,
      createdAt: new Date().toISOString()
    };
  }

  if (event.type === "message" && !event.subtype && /(#task|\/todo|\[task\])/i.test(event.text ?? "")) {
    return {
      eventId: payload.event_id ?? randomUUID(),
      source: "slack",
      workspaceId: payload.team_id ?? env.SLACK_WORKSPACE_ID,
      channelId: event.channel,
      threadTs: event.thread_ts,
      messageTs: event.ts,
      userId: event.user,
      text: event.text,
      rawPayload: payload,
      createdAt: new Date().toISOString()
    };
  }

  return null;
}

function toDiscordTrigger(payload: Record<string, any>): TriggerEvent | null {
  const text = payload.content ?? payload.text ?? "";
  const explicitTrigger = payload.trigger === true;

  if (!explicitTrigger && !/(#task|\/todo|\[task\])/i.test(text)) {
    return null;
  }

  return {
    eventId: payload.id ?? randomUUID(),
    source: "discord",
    workspaceId: payload.workspaceId ?? payload.guildId,
    channelId: payload.channelId,
    threadTs: payload.threadId,
    messageTs: payload.messageId,
    userId: payload.userId,
    text,
    rawPayload: payload,
    createdAt: new Date().toISOString()
  };
}

function safeJsonParse(rawBody: string): Record<string, any> | null {
  try {
    return JSON.parse(rawBody) as Record<string, any>;
  } catch {
    return null;
  }
}

function bufferToString(body: unknown): string {
  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  if (typeof body === "string") {
    return body;
  }

  if (body && typeof body === "object") {
    return JSON.stringify(body);
  }

  return "";
}
