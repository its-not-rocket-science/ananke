export const PLUGIN_PERMISSIONS = [
  "read:worldState",
  "write:worldState",
  "read:events",
  "write:telemetry",
  "write:artifacts",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];

export interface PluginManifest {
  id: string;
  version: string;
  hooks: string[];
  dependencies: Record<string, string>;
  permissions: PluginPermission[];
}

export interface PluginHookContext {
  worldState: Record<string, unknown>;
  events?: unknown[];
  [key: string]: unknown;
}

export type PluginHooks = Record<string, (context: PluginHookContext) => void | Promise<void>>;

export interface PluginRuntimeApi {
  readonly manifest: PluginManifest;
  hasPermission(permission: PluginPermission): boolean;
  readWorldState<T>(value: T): Readonly<T>;
  mutateWorld<T>(worldState: T, mutator: (draft: T) => void): void;
  emitTelemetry(metric: string, payload: unknown): void;
  writeArtifact(path: string, contents: string): void;
}

export interface PluginModule {
  setup(api: PluginRuntimeApi): PluginHooks;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  hooks: PluginHooks;
  runHook(hook: string, context: PluginHookContext): Promise<void>;
}
