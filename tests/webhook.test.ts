import crypto from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";

function signedSlackHeaders(rawBody: string): Record<string, string> {
  if (!env.SLACK_SIGNING_SECRET) {
    return {};
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const base = `v0:${timestamp}:${rawBody}`;
  const hash = crypto.createHmac("sha256", env.SLACK_SIGNING_SECRET).update(base).digest("hex");

  return {
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${hash}`
  };
}

describe("webhook ingestion", () => {
  const app = createApp();

  it("handles slack url verification", async () => {
    const rawBody = JSON.stringify({ type: "url_verification", challenge: "abc123" });

    const response = await request(app)
      .post("/webhooks/slack/events")
      .set("Content-Type", "application/json")
      .set(signedSlackHeaders(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.text).toBe("abc123");
  });

  it("accepts message trigger events", async () => {
    const rawBody = JSON.stringify({
      type: "event_callback",
      event_id: "evt-1",
      event: {
        type: "message",
        channel: "C123",
        ts: "123.456",
        text: "#task finish API docs",
        user: "U123"
      }
    });

    const response = await request(app)
      .post("/webhooks/slack/events")
      .set("Content-Type", "application/json")
      .set(signedSlackHeaders(rawBody))
      .send(rawBody);

    expect(response.status).toBe(202);
    expect(response.body.ok).toBe(true);
    expect(response.body.eventId).toBe("evt-1");
  });
});
