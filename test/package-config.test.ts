import { describe, test, expect } from "bun:test";

async function loadPackageJson(): Promise<Record<string, unknown>> {
  const path = new URL("../package.json", import.meta.url);
  const content = await Bun.file(path).text();
  return JSON.parse(content) as Record<string, unknown>;
}

describe("package.json publishing metadata", () => {
  test("uses npm scope and exposes ado binary", async () => {
    const pkg = await loadPackageJson();

    expect(pkg.name).toBe("@thanaen/ado-cli");
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin).toEqual({
      ado: "dist/cli.js",
    });
  });
});
