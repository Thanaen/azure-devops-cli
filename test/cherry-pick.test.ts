import { describe, test, expect } from "bun:test";
import { buildGeneratedRefName, parseCherryPickArgs } from "../src/cherry-pick.ts";

describe("parseCherryPickArgs", () => {
  test("parses PR id and target", () => {
    const result = parseCherryPickArgs(["42", "--target=main"]);
    expect(result).toEqual({ prId: 42, target: "main", topic: undefined, repo: undefined });
  });

  test("parses all options", () => {
    const result = parseCherryPickArgs([
      "100",
      "--target=release/v2",
      "--topic=my-branch",
      "--repo=other-repo",
    ]);
    expect(result).toEqual({
      prId: 100,
      target: "release/v2",
      topic: "my-branch",
      repo: "other-repo",
    });
  });

  test("throws when PR id is missing", () => {
    expect(() => parseCherryPickArgs(["--target=main"])).toThrow(
      "A valid pull request ID is required",
    );
  });

  test("throws when PR id is invalid", () => {
    expect(() => parseCherryPickArgs(["foo", "--target=main"])).toThrow(
      "A valid pull request ID is required",
    );
  });

  test("throws when target is missing", () => {
    expect(() => parseCherryPickArgs(["42"])).toThrow("--target is required");
  });

  test("throws on unknown options", () => {
    expect(() => parseCherryPickArgs(["42", "--target=main", "--bogus=x"])).toThrow(
      "Unknown option: --bogus",
    );
  });
});

describe("buildGeneratedRefName", () => {
  test("generates default branch name from PR id and target", () => {
    expect(buildGeneratedRefName(42, "main")).toBe("refs/heads/cherry-pick-pr-42-onto-main");
  });

  test("strips refs/heads/ prefix from target for default name", () => {
    expect(buildGeneratedRefName(42, "refs/heads/release/v2")).toBe(
      "refs/heads/cherry-pick-pr-42-onto-release/v2",
    );
  });

  test("uses custom topic when provided", () => {
    expect(buildGeneratedRefName(42, "main", "my-branch")).toBe("refs/heads/my-branch");
  });

  test("preserves refs/heads/ prefix in custom topic", () => {
    expect(buildGeneratedRefName(42, "main", "refs/heads/my-branch")).toBe("refs/heads/my-branch");
  });
});
