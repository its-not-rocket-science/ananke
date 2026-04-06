import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import type { LoadedPlugin, PluginHookContext, PluginManifest, PluginModule, PluginPermission, PluginRuntimeApi } from "./types.js";

export interface PluginLoaderOptions {
  onTelemetry?: (pluginId: string, metric: string, payload: unknown) => void;
  artifactsRoot?: string;
  /**
   * Optional evaluator override for hardened runtimes.
   *
   * Node hosts can swap this with a vm2/isolated-vm adapter for stronger isolation,
   * while browser hosts can evaluate plugins in a Web Worker.
   */
  evaluator?: (source: string, filename: string) => unknown;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission);
}

function evaluateCommonJsModule(source: string, filename: string): unknown {
  const module = { exports: {} as unknown };
  const sandbox = {
    module,
    exports: module.exports,
  };

  const script = new vm.Script(source, { filename });
  script.runInNewContext(sandbox, {
    timeout: 100,
    microtaskMode: "afterEvaluate",
  });
  return module.exports;
}

function createRuntimeApi(manifest: PluginManifest, options: PluginLoaderOptions): PluginRuntimeApi {
  return {
    manifest,
    hasPermission: permission => hasPermission(manifest, permission),
    readWorldState: value => deepFreeze(structuredClone(value)),
    mutateWorld: (worldState, mutator) => {
      if (!hasPermission(manifest, "write:worldState")) {
        throw new Error(`Plugin ${manifest.id} attempted world mutation without write:worldState permission`);
      }
      mutator(worldState);
    },
    emitTelemetry: (metric, payload) => {
      if (!hasPermission(manifest, "write:telemetry")) {
        throw new Error(`Plugin ${manifest.id} attempted telemetry write without write:telemetry permission`);
      }
      options.onTelemetry?.(manifest.id, metric, payload);
    },
    writeArtifact: (path, contents) => {
      if (!hasPermission(manifest, "write:artifacts")) {
        throw new Error(`Plugin ${manifest.id} attempted artifact write without write:artifacts permission`);
      }
      const outputPath = resolve(options.artifactsRoot ?? ".ananke-artifacts", manifest.id, path);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, contents, "utf8");
    },
  };
}

/**
 * Load plugin manifest + module from disk.
 *
 * Security notes:
 * - Node default uses node:vm with a minimal CommonJS sandbox.
 * - For untrusted third-party code in production, use the `evaluator` option with
 *   vm2 or isolated-vm.
 * - Browser hosts should evaluate plugin code inside a dedicated Web Worker and
 *   proxy only the PluginRuntimeApi methods.
 */
export function loadPlugin(path: string, options: PluginLoaderOptions = {}): LoadedPlugin {
  const pluginRoot = resolve(path);
  const manifest = JSON.parse(readFileSync(resolve(pluginRoot, "plugin.json"), "utf8")) as PluginManifest;
  const source = readFileSync(resolve(pluginRoot, "index.js"), "utf8");

  const rawModule = (options.evaluator ?? evaluateCommonJsModule)(source, `${manifest.id}/index.js`);
  const pluginModule = rawModule as PluginModule;

  if (!pluginModule || typeof pluginModule.setup !== "function") {
    throw new Error(`Plugin ${manifest.id} must export setup(api)`);
  }

  const hooks = pluginModule.setup(createRuntimeApi(manifest, options));

  return {
    manifest,
    hooks,
    async runHook(hook: string, context: PluginHookContext): Promise<void> {
      const handler = hooks[hook];
      if (!handler) return;
      await handler(context);
    },
  };
}
