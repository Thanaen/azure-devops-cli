import { describe, test, expect } from "bun:test";
import { buildRecentWorkItemsWiql, parseWorkItemsRecentArgs } from "../src/workitems-query.ts";

describe("parseWorkItemsRecentArgs", () => {
  test("keeps backward-compatible positional top", () => {
    const parsed = parseWorkItemsRecentArgs(["25"]);

    expect(parsed.top).toBe(25);
    expect(parsed.filters).toEqual({
      tag: undefined,
      type: undefined,
      state: undefined,
    });
  });

  test("supports tag/type/state filters", () => {
    const parsed = parseWorkItemsRecentArgs(["--top=12", "--tag=bot", "--type=Bug", "--state=New"]);

    expect(parsed.top).toBe(12);
    expect(parsed.filters).toEqual({
      tag: "bot",
      type: "Bug",
      state: "New",
    });
  });

  test("rejects unknown options", () => {
    expect(() => parseWorkItemsRecentArgs(["--foo=bar"])).toThrow(/Unknown option/);
  });
});

describe("buildRecentWorkItemsWiql", () => {
  test("builds combined WHERE clause", () => {
    const wiql = buildRecentWorkItemsWiql({ tag: "bot", type: "Bug", state: "Active" });

    expect(wiql).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] = 'Active' AND [System.Tags] CONTAINS 'bot' ORDER BY [System.ChangedDate] DESC",
    );
  });

  test("escapes single quotes in filters", () => {
    const wiql = buildRecentWorkItemsWiql({ tag: "bot's", type: "Bug's" });

    expect(wiql).toBe(
      "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug''s' AND [System.Tags] CONTAINS 'bot''s' ORDER BY [System.ChangedDate] DESC",
    );
  });
});
