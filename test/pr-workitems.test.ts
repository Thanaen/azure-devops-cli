import { describe, test, expect } from "bun:test";
import { buildPullRequestArtifactUrl, parseWorkItemIds } from "../src/pr-workitems.ts";

describe("parseWorkItemIds", () => {
  test("parses comma-separated ids, filters invalid values, and deduplicates", () => {
    const ids = parseWorkItemIds("20519, 20520,foo,0,-3,20519,  42  ");
    expect(ids).toEqual([20519, 20520, 42]);
  });

  test("returns empty array for empty input", () => {
    expect(parseWorkItemIds("")).toEqual([]);
    expect(parseWorkItemIds(undefined)).toEqual([]);
  });
});

describe("buildPullRequestArtifactUrl", () => {
  test("builds expected vstfs URL", () => {
    const artifactUrl = buildPullRequestArtifactUrl({
      pullRequestId: 2037,
      repository: {
        id: "repo-id-123",
        project: { id: "project-id-456" },
      },
    });

    expect(artifactUrl).toBe("vstfs:///Git/PullRequestId/project-id-456%2Frepo-id-123%2F2037");
  });

  test("returns null when mandatory fields are missing", () => {
    expect(buildPullRequestArtifactUrl({})).toBeNull();
    expect(buildPullRequestArtifactUrl(null)).toBeNull();
  });
});
