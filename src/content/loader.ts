import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ContentPack, ContentPackValidationError } from "./types.js";

const PACK_CACHE = new Map<string, ContentPack>();
const SCHEMA_CACHE = new Map<string, unknown>();

interface JsonWithPositionError extends Error {
  message: string;
}

function buildJsonParseError(raw: string, err: JsonWithPositionError): Error {
  const posMatch = /position\s+(\d+)/i.exec(err.message);
  if (!posMatch) return err;
  const pos = Number(posMatch[1]);
  const prefix = raw.slice(0, Math.max(0, pos));
  const line = prefix.split("\n").length;
  const col = pos - prefix.lastIndexOf("\n");
  return new Error(`Invalid JSON at line ${line}, column ${col}: ${err.message}`);
}

function getByPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "#") return root;
  const segments = pointer.replace(/^#\//, "").split("/").map(p => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const seg of segments) {
    if (typeof cur !== "object" || cur === null || !(seg in (cur as Record<string, unknown>))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

async function loadSchemaRef(ref: string, basePath: string): Promise<unknown> {
  if (ref.startsWith("#")) return undefined;
  const [docUrlPart] = ref.split("#");
  const docUrl = docUrlPart ?? "";
  if (SCHEMA_CACHE.has(docUrl)) return SCHEMA_CACHE.get(docUrl);

  let schemaDoc: unknown;
  if (docUrl.startsWith("https://")) {
    const response = await fetch(docUrl);
    if (!response.ok) throw new Error(`Failed to fetch schema ref ${docUrl}: HTTP ${response.status}`);
    schemaDoc = await response.json();
  } else {
    const schemaPath = isAbsolute(docUrl) ? docUrl : resolve(dirname(basePath), docUrl);
    schemaDoc = JSON.parse(await readFile(schemaPath, "utf8"));
  }

  SCHEMA_CACHE.set(docUrl, schemaDoc);
  return schemaDoc;
}

async function resolveRefs(schema: unknown, basePath: string, rootSchema?: unknown): Promise<unknown> {
  if (Array.isArray(schema)) {
    return Promise.all(schema.map(item => resolveRefs(item, basePath, rootSchema ?? schema)));
  }
  if (typeof schema !== "object" || schema === null) return schema;

  const record = schema as Record<string, unknown>;
  if (typeof record["$ref"] === "string") {
    const ref = record["$ref"] as string;
    if (ref.startsWith("#")) {
      const target = getByPointer(rootSchema ?? schema, ref);
      if (target === undefined) throw new Error(`Unresolvable local schema ref: ${ref}`);
      return resolveRefs(target, basePath, rootSchema ?? schema);
    }

    const external = await loadSchemaRef(ref, basePath);
    const pointer = ref.includes("#") ? `#${ref.split("#")[1]}` : "#";
    const target = getByPointer(external, pointer);
    if (target === undefined) throw new Error(`Unresolvable external schema ref: ${ref}`);
    return resolveRefs(target, basePath, external);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = await resolveRefs(v, basePath, rootSchema ?? schema);
  }
  return out;
}

function validateAgainstSchema(data: unknown, schema: unknown, path = "$"): ContentPackValidationError[] {
  const errors: ContentPackValidationError[] = [];
  if (typeof schema !== "object" || schema === null) return errors;

  const s = schema as Record<string, unknown>;
  const expectedType = s.type as string | undefined;

  if (expectedType) {
    const typeOkay =
      (expectedType === "array" && Array.isArray(data)) ||
      (expectedType === "object" && typeof data === "object" && data !== null && !Array.isArray(data)) ||
      (expectedType === "string" && typeof data === "string") ||
      (expectedType === "number" && typeof data === "number") ||
      (expectedType === "integer" && Number.isInteger(data)) ||
      (expectedType === "boolean" && typeof data === "boolean");
    if (!typeOkay) {
      errors.push({ path, message: `expected ${expectedType}` });
      return errors;
    }
  }

  if (typeof data === "string") {
    if (typeof s.minLength === "number" && data.length < s.minLength) errors.push({ path, message: `minLength ${s.minLength}` });
    if (typeof s.pattern === "string" && !(new RegExp(s.pattern).test(data))) errors.push({ path, message: `must match pattern ${s.pattern}` });
  }

  if (typeof data === "number") {
    if (typeof s.minimum === "number" && data < s.minimum) errors.push({ path, message: `must be >= ${s.minimum}` });
    if (typeof s.maximum === "number" && data > s.maximum) errors.push({ path, message: `must be <= ${s.maximum}` });
    if (typeof s.exclusiveMinimum === "number" && data <= s.exclusiveMinimum) errors.push({ path, message: `must be > ${s.exclusiveMinimum}` });
  }

  if (Array.isArray(s.enum) && !s.enum.includes(data)) {
    errors.push({ path, message: `must be one of ${s.enum.join(", ")}` });
  }

  if (Array.isArray(data)) {
    if (typeof s.minItems === "number" && data.length < s.minItems) errors.push({ path, message: `minItems ${s.minItems}` });
    if (s.items !== undefined) {
      data.forEach((item, idx) => {
        errors.push(...validateAgainstSchema(item, s.items, `${path}[${idx}]`));
      });
    }
  }

  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const required = Array.isArray(s.required) ? (s.required as string[]) : [];
    for (const req of required) {
      if (!(req in o)) errors.push({ path: `${path}.${req}`, message: "is required" });
    }

    const properties = (s.properties ?? {}) as Record<string, unknown>;
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in o) errors.push(...validateAgainstSchema(o[key], propSchema, `${path}.${key}`));
    }

    const additional = s.additionalProperties;
    if (additional && typeof additional === "object") {
      for (const [key, value] of Object.entries(o)) {
        if (!(key in properties)) errors.push(...validateAgainstSchema(value, additional, `${path}.${key}`));
      }
    }
  }

  return errors;
}

export async function loadContentPack(path: string): Promise<ContentPack> {
  const absPath = resolve(path);
  const cached = PACK_CACHE.get(absPath);
  if (cached) return cached;

  const raw = await readFile(absPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw buildJsonParseError(raw, err as JsonWithPositionError);
  }

  const schemaPath = resolve(process.cwd(), "schema/content-pack.schema.json");
  const schemaRaw = JSON.parse(await readFile(schemaPath, "utf8"));
  const resolvedSchema = await resolveRefs(schemaRaw, schemaPath, schemaRaw);
  const errors = validateAgainstSchema(parsed, resolvedSchema);

  if (errors.length > 0) {
    const lines = errors.map(e => `${e.path}: ${e.message}`).join("\n");
    throw new Error(`Content pack schema validation failed:\n${lines}`);
  }

  const pack = parsed as ContentPack;
  PACK_CACHE.set(absPath, pack);
  return pack;
}

export function clearContentPackCache(): void {
  PACK_CACHE.clear();
}
