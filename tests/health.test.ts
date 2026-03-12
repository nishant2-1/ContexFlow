import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("health endpoints", () => {
  const app = createApp();

  it("returns healthy status", async () => {
    const response = await request(app).get("/api/healthz");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.service).toBe("contextflow");
  });

  it("returns readiness status", async () => {
    const response = await request(app).get("/api/readyz");

    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
  });
});
