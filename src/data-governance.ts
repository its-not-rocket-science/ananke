export type RegionId = string;
export type TenantId = string;

export interface RetentionPolicy {
  /**
   * Default time-to-live in milliseconds for records.
   */
  defaultTtlMs: number;
}

export interface DataEnvelope {
  id: string;
  tenantId: TenantId;
  regionId: RegionId;
  createdAtMs: number;
  expiresAtMs: number;
  legalHold: boolean;
  piiDetected: boolean;
  piiFindings: PIIFinding[];
  payload: unknown;
}

export interface PIIFinding {
  path: string;
  kind: "email" | "phone" | "ssn" | "creditCard" | "sensitiveKey";
}

export interface AccessEvent {
  timestampMs: number;
  actor: string;
  action: "write" | "read" | "list" | "legal_hold_set" | "legal_hold_released" | "purge";
  tenantId: TenantId;
  regionId: RegionId;
  recordId?: string;
  details?: string;
}

export interface IngestOptions {
  nowMs?: number;
  ttlMs?: number;
  redactSensitiveFields?: boolean;
  actor?: string;
}

export interface ReadOptions {
  nowMs?: number;
  actor?: string;
}

export interface ListOptions {
  nowMs?: number;
  actor?: string;
}

export interface LegalHoldOptions {
  actor?: string;
  nowMs?: number;
}

export interface TenancyModel {
  isolation: "tenant-region-partition";
  partitionKey: "regionId/tenantId";
  replication: "none_cross_region";
  accessAudit: "immutable_append_only";
}

export function buildTenancyModel(): TenancyModel {
  return {
    isolation: "tenant-region-partition",
    partitionKey: "regionId/tenantId",
    replication: "none_cross_region",
    accessAudit: "immutable_append_only",
  };
}

interface ValueScanResult {
  redactedValue: unknown;
  findings: PIIFinding[];
}

const SENSITIVE_KEY_PATTERN = /(email|phone|ssn|social|taxid|credit|card|password|secret|token|passport)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const CREDIT_CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/;

function detectFindingsFromString(path: string, value: string): PIIFinding[] {
  const findings: PIIFinding[] = [];
  if (EMAIL_PATTERN.test(value)) findings.push({ path, kind: "email" });
  if (PHONE_PATTERN.test(value)) findings.push({ path, kind: "phone" });
  if (SSN_PATTERN.test(value)) findings.push({ path, kind: "ssn" });
  if (CREDIT_CARD_PATTERN.test(value)) findings.push({ path, kind: "creditCard" });
  return findings;
}

function scanValue(path: string, value: unknown, redactSensitiveFields: boolean): ValueScanResult {
  if (typeof value === "string") {
    const findings = detectFindingsFromString(path, value);
    return {
      findings,
      redactedValue: redactSensitiveFields && findings.length > 0 ? "[REDACTED]" : value,
    };
  }

  if (Array.isArray(value)) {
    const findings: PIIFinding[] = [];
    const redacted = value.map((entry, idx) => {
      const child = scanValue(`${path}[${idx}]`, entry, redactSensitiveFields);
      findings.push(...child.findings);
      return child.redactedValue;
    });
    return { findings, redactedValue: redacted };
  }

  if (value !== null && typeof value === "object") {
    const findings: PIIFinding[] = [];
    const out: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const keyIsSensitive = SENSITIVE_KEY_PATTERN.test(key);
      if (keyIsSensitive) {
        findings.push({ path: childPath, kind: "sensitiveKey" });
      }
      if (keyIsSensitive && redactSensitiveFields) {
        out[key] = "[REDACTED]";
        continue;
      }
      const child = scanValue(childPath, childValue, redactSensitiveFields);
      findings.push(...child.findings);
      out[key] = child.redactedValue;
    }
    return { findings, redactedValue: out };
  }

  return { findings: [], redactedValue: value };
}

function makeRecordKey(tenantId: TenantId, regionId: RegionId, id: string): string {
  return `${regionId}::${tenantId}::${id}`;
}

export class DataGovernanceStore {
  private readonly retention: RetentionPolicy;
  private readonly records = new Map<string, DataEnvelope>();
  private readonly byPartition = new Map<string, Set<string>>();
  private readonly accessLog: AccessEvent[] = [];

  constructor(retention: RetentionPolicy) {
    if (retention.defaultTtlMs <= 0) {
      throw new Error("defaultTtlMs must be > 0");
    }
    this.retention = retention;
  }

  ingest(tenantId: TenantId, regionId: RegionId, recordId: string, payload: unknown, options: IngestOptions = {}): DataEnvelope {
    const nowMs = options.nowMs ?? Date.now();
    const ttlMs = options.ttlMs ?? this.retention.defaultTtlMs;
    const redactSensitiveFields = options.redactSensitiveFields ?? true;
    const actor = options.actor ?? "system";

    const scanned = scanValue("", payload, redactSensitiveFields);
    const envelope: DataEnvelope = {
      id: recordId,
      tenantId,
      regionId,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      legalHold: false,
      piiDetected: scanned.findings.length > 0,
      piiFindings: scanned.findings,
      payload: scanned.redactedValue,
    };

    const key = makeRecordKey(tenantId, regionId, recordId);
    this.records.set(key, envelope);
    const partition = `${regionId}/${tenantId}`;
    let set = this.byPartition.get(partition);
    if (!set) {
      set = new Set<string>();
      this.byPartition.set(partition, set);
    }
    set.add(key);

    this.log({ timestampMs: nowMs, actor, action: "write", tenantId, regionId, recordId });
    return envelope;
  }

  get(tenantId: TenantId, regionId: RegionId, recordId: string, options: ReadOptions = {}): DataEnvelope | undefined {
    const nowMs = options.nowMs ?? Date.now();
    const actor = options.actor ?? "system";
    const key = makeRecordKey(tenantId, regionId, recordId);
    const record = this.records.get(key);
    this.log({ timestampMs: nowMs, actor, action: "read", tenantId, regionId, recordId });

    if (!record) return undefined;
    if (!record.legalHold && record.expiresAtMs <= nowMs) return undefined;
    return record;
  }

  listByPartition(tenantId: TenantId, regionId: RegionId, options: ListOptions = {}): DataEnvelope[] {
    const nowMs = options.nowMs ?? Date.now();
    const actor = options.actor ?? "system";
    this.log({ timestampMs: nowMs, actor, action: "list", tenantId, regionId });

    const partition = `${regionId}/${tenantId}`;
    const keys = this.byPartition.get(partition);
    if (!keys) return [];

    const out: DataEnvelope[] = [];
    for (const key of keys) {
      const rec = this.records.get(key);
      if (!rec) continue;
      if (!rec.legalHold && rec.expiresAtMs <= nowMs) continue;
      out.push(rec);
    }
    return out;
  }

  setLegalHold(tenantId: TenantId, regionId: RegionId, recordId: string, options: LegalHoldOptions = {}): boolean {
    return this.updateLegalHold(tenantId, regionId, recordId, true, options);
  }

  releaseLegalHold(tenantId: TenantId, regionId: RegionId, recordId: string, options: LegalHoldOptions = {}): boolean {
    return this.updateLegalHold(tenantId, regionId, recordId, false, options);
  }

  purgeExpired(nowMs: number, actor = "system"): number {
    let purged = 0;
    for (const [key, record] of this.records.entries()) {
      if (record.legalHold || record.expiresAtMs > nowMs) continue;
      this.records.delete(key);
      const partition = `${record.regionId}/${record.tenantId}`;
      this.byPartition.get(partition)?.delete(key);
      this.log({
        timestampMs: nowMs,
        actor,
        action: "purge",
        tenantId: record.tenantId,
        regionId: record.regionId,
        recordId: record.id,
      });
      purged += 1;
    }
    return purged;
  }

  getAccessLog(): readonly AccessEvent[] {
    return this.accessLog;
  }

  private updateLegalHold(
    tenantId: TenantId,
    regionId: RegionId,
    recordId: string,
    state: boolean,
    options: LegalHoldOptions,
  ): boolean {
    const nowMs = options.nowMs ?? Date.now();
    const actor = options.actor ?? "system";
    const key = makeRecordKey(tenantId, regionId, recordId);
    const rec = this.records.get(key);
    if (!rec) return false;
    rec.legalHold = state;
    this.log({
      timestampMs: nowMs,
      actor,
      action: state ? "legal_hold_set" : "legal_hold_released",
      tenantId,
      regionId,
      recordId,
    });
    return true;
  }

  private log(event: AccessEvent): void {
    this.accessLog.push(event);
  }
}
