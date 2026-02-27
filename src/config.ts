import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";
import type { AdoConfig, FileConfig } from "./types.ts";

const DEFAULT_COLLECTION_URL = "https://dev.azure.com/<your-org>";
const DEFAULT_PROJECT = "<your-project>";
const DEFAULT_REPO = "<your-repository>";

export const LOCAL_CONFIG_FILENAME = "ado.json";

function isDefaultPlaceholder(value: string): boolean {
  return value.includes("<your-");
}

export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  const base = xdgConfig && xdgConfig.length > 0 ? xdgConfig : join(homedir(), ".config");
  return join(base, "ado");
}

export function getConfigFilePath(): string {
  return join(getConfigDir(), "config.json");
}

export function loadFileConfig(): FileConfig {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, "utf8");
  try {
    return JSON.parse(content) as FileConfig;
  } catch {
    console.error(`Warning: could not parse config file at ${configPath}. Using defaults.`);
    return {};
  }
}

export function getLocalConfigFilePath(): string {
  return join(process.cwd(), LOCAL_CONFIG_FILENAME);
}

export function loadLocalConfig(): FileConfig {
  const localPath = getLocalConfigFilePath();
  if (!existsSync(localPath)) {
    return {};
  }

  const content = readFileSync(localPath, "utf8");
  try {
    return JSON.parse(content) as FileConfig;
  } catch {
    console.error(`Warning: could not parse local config file at ${localPath}. Ignoring.`);
    return {};
  }
}

export function censorPat(pat: string): string {
  if (pat.length <= 8) {
    return "****";
  }
  return `${pat.slice(0, 4)}${"*".repeat(pat.length - 8)}${pat.slice(-4)}`;
}

export function getConfig(): AdoConfig {
  const fileConfig = loadFileConfig();
  const localConfig = loadLocalConfig();

  const pat = process.env.DEVOPS_PAT ?? localConfig.pat ?? fileConfig.pat;
  if (!pat) {
    console.error("Missing DEVOPS_PAT environment variable or pat in config file.");
    console.error(`Run "ado init" to create a config file at ${getConfigFilePath()}`);
    process.exit(1);
  }

  const collectionUrl =
    process.env.ADO_COLLECTION_URL ??
    localConfig.collectionUrl ??
    fileConfig.collectionUrl ??
    DEFAULT_COLLECTION_URL;
  const project =
    process.env.ADO_PROJECT ?? localConfig.project ?? fileConfig.project ?? DEFAULT_PROJECT;
  const repo = process.env.ADO_REPO ?? localConfig.repo ?? fileConfig.repo ?? DEFAULT_REPO;

  if (
    isDefaultPlaceholder(collectionUrl) ||
    isDefaultPlaceholder(project) ||
    isDefaultPlaceholder(repo)
  ) {
    console.error(
      "ADO configuration is incomplete. Set ADO_COLLECTION_URL, ADO_PROJECT, and ADO_REPO.",
    );
    console.error(`You can also run "ado init" to create a config file at ${getConfigFilePath()}`);
    process.exit(1);
  }

  const insecure =
    process.env.ADO_INSECURE === "1" ||
    localConfig.insecure === true ||
    fileConfig.insecure === true;
  if (insecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const authHandler = getPersonalAccessTokenHandler(pat);
  const connection = new WebApi(collectionUrl, authHandler);

  return {
    pat,
    collectionUrl,
    project,
    repo,
    connection,
  };
}
