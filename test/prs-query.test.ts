import { describe, test, expect } from "bun:test";
import { labelsContainTag, parsePrsArgs } from "../src/prs-query.ts";

describe("parsePrsArgs", () => {
  test("keeps backward-compatible positional args", () => {
    const parsed = parsePrsArgs(["completed", "25", "MyRepo"]);

    expect(parsed).toEqual({
      status: "completed",
      top: 25,
      repo: "MyRepo",
      tag: undefined,
    });
  });

  test("supports tag option with positional defaults", () => {
    const parsed = parsePrsArgs(["--tag=release"]);

    expect(parsed).toEqual({
      status: "active",
      top: 10,
      repo: undefined,
      tag: "release",
    });
  });

  test("supports --tag value syntax", () => {
    const parsed = parsePrsArgs(["active", "10", "--tag", "backend"]);
    expect(parsed.tag).toBe("backend");
  });

  test("rejects unknown options", () => {
    expect(() => parsePrsArgs(["--foo=bar"])).toThrow(/Unknown option/);
  });

  test("rejects too many positional args", () => {
    expect(() => parsePrsArgs(["a", "b", "c", "d"])).toThrow(/Usage: prs/);
  });
});

describe("labelsContainTag", () => {
  test("matches tags case-insensitively", () => {
    const hasTag = labelsContainTag([{ name: "Release" }, { name: "Backend" }], "release");
    expect(hasTag).toBe(true);
  });

  test("returns false when no labels match", () => {
    const hasTag = labelsContainTag([{ name: "Backend" }], "frontend");
    expect(hasTag).toBe(false);
  });
});
