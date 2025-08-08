import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";

describe("health endpoint", () => {
  it("returns ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("ok");
  });
});
