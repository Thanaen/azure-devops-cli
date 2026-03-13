import { describe, test, expect } from "bun:test";

describe("Node.js warning suppression", () => {
  test("process.removeAllListeners('warning') clears warning listeners", () => {
    // Simulate what cli.ts does at module level
    process.on("warning", () => {});
    expect(process.listenerCount("warning")).toBeGreaterThan(0);

    process.removeAllListeners("warning");
    expect(process.listenerCount("warning")).toBe(0);
  });
});
