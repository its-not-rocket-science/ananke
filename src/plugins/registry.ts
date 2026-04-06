import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface RegistryIndexEntry {
  name: string;
  manifestUrl: string;
  moduleUrl: string;
}

export interface RegistryInstallerOptions {
  registryIndexUrl?: string;
  pluginsDir?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_REGISTRY_INDEX_URL = "https://raw.githubusercontent.com/its-not-rocket-science/ananke-plugins/main/index.json";

export async function installPluginFromRegistry(pluginName: string, options: RegistryInstallerOptions = {}): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const indexUrl = options.registryIndexUrl ?? DEFAULT_REGISTRY_INDEX_URL;
  const pluginsDir = resolve(options.pluginsDir ?? "plugins");

  const indexResp = await fetchImpl(indexUrl);
  if (!indexResp.ok) {
    throw new Error(`Failed to fetch registry index: ${indexResp.status} ${indexResp.statusText}`);
  }

  const entries = (await indexResp.json()) as RegistryIndexEntry[];
  const entry = entries.find(candidate => candidate.name === pluginName);
  if (!entry) {
    throw new Error(`Plugin ${pluginName} was not found in ${indexUrl}`);
  }

  const [manifestResp, moduleResp] = await Promise.all([
    fetchImpl(entry.manifestUrl),
    fetchImpl(entry.moduleUrl),
  ]);

  if (!manifestResp.ok || !moduleResp.ok) {
    throw new Error(`Failed to fetch ${pluginName} package files from registry`);
  }

  mkdirSync(resolve(pluginsDir, pluginName), { recursive: true });
  writeFileSync(resolve(pluginsDir, pluginName, "plugin.json"), await manifestResp.text(), "utf8");
  writeFileSync(resolve(pluginsDir, pluginName, "index.js"), await moduleResp.text(), "utf8");

  return resolve(pluginsDir, pluginName);
}
