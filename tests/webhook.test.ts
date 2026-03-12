import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("webhook ingestion", () => {
  const app = createApp();

  it("handles slack url verification", async () => {
    const response = await request(app)
      .post("/webhooks/slack/events")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "url_verification", challenge: "abc123" }));

    expect(response.status).toBe(200);
    expect(response.text).toBe("abc123");
  });

  it("accepts message trigger events", async () => {
    const response = await request(app)
      .post("/webhooks/slack/events")
      .set("Content-Type", "application/json")
      .send(
        JSON.stringify({
          type: "event_callback",
          event_id: "evt-1",
          event: {
            type: "message",
            channel: "C123",
            ts: "123.456",
            text: "#task finish API docs",
            user: "U123"
          }
        })
      );

    expect(response.status).toBe(202);
    expect(response.body.ok).toBe(true);
    expect(response.body.eventId).toBe("evt-1");
  });
});
