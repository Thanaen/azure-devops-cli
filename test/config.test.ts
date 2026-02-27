import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("censorPat", () => {
  test("censors PAT longer than 8 characters showing first and last 4", async () => {
    const { censorPat } = await import("../src/config.ts");
    expect(censorPat("abcdefghijklmnop")).toBe("abcd********mnop");
  });

  test("returns **** for short PAT", async () => {
    const { censorPat } = await import("../src/config.ts");
    expect(censorPat("short")).toBe("****");
  });

  test("returns **** for exactly 8-char PAT", async () => {
    const { censorPat } = await import("../src/config.ts");
    expect(censorPat("12345678")).toBe("****");
  });

  test("censors 9-char PAT", async () => {
    const { censorPat } = await import("../src/config.ts");
    expect(censorPat("123456789")).toBe("1234*6789");
  });
});

describe("local config loading", () => {
  let testDir: string;
  let originalCwd: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = join(tmpdir(), `ado-cli-local-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    rmSync(testDir, { recursive: true, force: true });
  });

  test("loadLocalConfig returns empty object when no ado.json exists", async () => {
    const { loadLocalConfig } = await import("../src/config.ts");
    const result = loadLocalConfig();
    expect(result).toEqual({});
  });

  test("loadLocalConfig reads ado.json from cwd", async () => {
    const localConfig = { project: "LocalProject", repo: "LocalRepo" };
    writeFileSync(join(testDir, "ado.json"), JSON.stringify(localConfig), "utf8");

    const { loadLocalConfig } = await import("../src/config.ts");
    const result = loadLocalConfig();
    expect(result).toEqual(localConfig);
  });

  test("getLocalConfigFilePath returns ado.json in cwd", async () => {
    const { getLocalConfigFilePath } = await import("../src/config.ts");
    expect(getLocalConfigFilePath()).toBe(join(testDir, "ado.json"));
  });

  test("local config overrides global config", async () => {
    const globalDir = join(testDir, "global-config", "ado");
    mkdirSync(globalDir, { recursive: true });
    process.env.XDG_CONFIG_HOME = join(testDir, "global-config");

    const globalConfig = {
      pat: "global-pat",
      collectionUrl: "https://dev.azure.com/global-org",
      project: "GlobalProject",
      repo: "GlobalRepo",
    };
    writeFileSync(join(globalDir, "config.json"), JSON.stringify(globalConfig), "utf8");

    const localConfig = { project: "LocalProject", repo: "LocalRepo" };
    writeFileSync(join(testDir, "ado.json"), JSON.stringify(localConfig), "utf8");

    delete process.env.DEVOPS_PAT;
    delete process.env.ADO_COLLECTION_URL;
    delete process.env.ADO_PROJECT;
    delete process.env.ADO_REPO;

    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.pat).toBe("global-pat");
    expect(config.collectionUrl).toBe("https://dev.azure.com/global-org");
    expect(config.project).toBe("LocalProject");
    expect(config.repo).toBe("LocalRepo");
  });

  test("env vars take priority over local config", async () => {
    const globalDir = join(testDir, "global-config", "ado");
    mkdirSync(globalDir, { recursive: true });
    process.env.XDG_CONFIG_HOME = join(testDir, "global-config");

    const globalConfig = {
      pat: "global-pat",
      collectionUrl: "https://dev.azure.com/global-org",
      project: "GlobalProject",
      repo: "GlobalRepo",
    };
    writeFileSync(join(globalDir, "config.json"), JSON.stringify(globalConfig), "utf8");

    const localConfig = { project: "LocalProject", repo: "LocalRepo" };
    writeFileSync(join(testDir, "ado.json"), JSON.stringify(localConfig), "utf8");

    process.env.ADO_PROJECT = "EnvProject";

    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.project).toBe("EnvProject");
    expect(config.repo).toBe("LocalRepo");
  });
});

describe("config file loading", () => {
  let testDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = join(tmpdir(), `ado-cli-test-${Date.now()}`);
    mkdirSync(join(testDir, "ado"), { recursive: true });
    process.env.XDG_CONFIG_HOME = testDir;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(testDir, { recursive: true, force: true });
  });

  test("getConfigDir respects XDG_CONFIG_HOME", async () => {
    const { getConfigDir } = await import("../src/config.ts");
    expect(getConfigDir()).toBe(join(testDir, "ado"));
  });

  test("getConfigFilePath returns path inside config dir", async () => {
    const { getConfigFilePath } = await import("../src/config.ts");
    expect(getConfigFilePath()).toBe(join(testDir, "ado", "config.json"));
  });

  test("loadFileConfig returns empty object when file does not exist", async () => {
    process.env.XDG_CONFIG_HOME = join(testDir, "nonexistent");
    const { loadFileConfig } = await import("../src/config.ts");
    const result = loadFileConfig();
    expect(result).toEqual({});
  });

  test("loadFileConfig reads config.json", async () => {
    const configPath = join(testDir, "ado", "config.json");
    const config = {
      pat: "test-pat",
      collectionUrl: "https://dev.azure.com/test-org",
      project: "TestProject",
      repo: "TestRepo",
      insecure: false,
    };
    writeFileSync(configPath, JSON.stringify(config), "utf8");

    const { loadFileConfig } = await import("../src/config.ts");
    const result = loadFileConfig();
    expect(result).toEqual(config);
  });

  test("env vars take priority over file config", async () => {
    const configPath = join(testDir, "ado", "config.json");
    const fileConfig = {
      pat: "file-pat",
      collectionUrl: "https://dev.azure.com/file-org",
      project: "FileProject",
      repo: "FileRepo",
    };
    writeFileSync(configPath, JSON.stringify(fileConfig), "utf8");

    process.env.DEVOPS_PAT = "env-pat";
    process.env.ADO_COLLECTION_URL = "https://dev.azure.com/env-org";
    process.env.ADO_PROJECT = "EnvProject";
    process.env.ADO_REPO = "EnvRepo";

    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.pat).toBe("env-pat");
    expect(config.collectionUrl).toBe("https://dev.azure.com/env-org");
    expect(config.project).toBe("EnvProject");
    expect(config.repo).toBe("EnvRepo");
  });

  test("file config is used when env vars are not set", async () => {
    const configPath = join(testDir, "ado", "config.json");
    const fileConfig = {
      pat: "file-pat",
      collectionUrl: "https://dev.azure.com/file-org",
      project: "FileProject",
      repo: "FileRepo",
    };
    writeFileSync(configPath, JSON.stringify(fileConfig), "utf8");

    delete process.env.DEVOPS_PAT;
    delete process.env.ADO_COLLECTION_URL;
    delete process.env.ADO_PROJECT;
    delete process.env.ADO_REPO;

    const { getConfig } = await import("../src/config.ts");
    const config = getConfig();

    expect(config.pat).toBe("file-pat");
    expect(config.collectionUrl).toBe("https://dev.azure.com/file-org");
    expect(config.project).toBe("FileProject");
    expect(config.repo).toBe("FileRepo");
  });
});
