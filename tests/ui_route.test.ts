import { describe, it, expect } from "bun:test";
import { createApp } from "../src/server.ts";

describe("/ui route", () => {
  it("serves HTML", async () => {
    const app = createApp();
    const res = await app.request("/ui");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.toLowerCase()).toContain("<html");
    expect(html).toContain("/events");
  });
});
