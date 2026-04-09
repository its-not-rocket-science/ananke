import { describe, expect, it } from "vitest";
import { DataGovernanceStore, buildTenancyModel } from "../src/data-governance";

describe("data governance", () => {
  it("provides a tenant + region partitioned tenancy model", () => {
    const model = buildTenancyModel();
    expect(model).toEqual({
      isolation: "tenant-region-partition",
      partitionKey: "regionId/tenantId",
      replication: "none_cross_region",
      accessAudit: "immutable_append_only",
    });
  });

  it("stores records per tenant+region partition", () => {
    const store = new DataGovernanceStore({ defaultTtlMs: 5_000 });
    store.ingest("tenant-a", "us-east-1", "id-1", { x: 1 }, { nowMs: 1000 });
    store.ingest("tenant-a", "eu-west-1", "id-2", { x: 2 }, { nowMs: 1000 });
    store.ingest("tenant-b", "us-east-1", "id-3", { x: 3 }, { nowMs: 1000 });

    expect(store.listByPartition("tenant-a", "us-east-1", { nowMs: 1001 })).toHaveLength(1);
    expect(store.listByPartition("tenant-a", "eu-west-1", { nowMs: 1001 })).toHaveLength(1);
    expect(store.listByPartition("tenant-b", "us-east-1", { nowMs: 1001 })).toHaveLength(1);
    expect(store.listByPartition("tenant-b", "eu-west-1", { nowMs: 1001 })).toHaveLength(0);
  });

  it("detects and redacts PII in payloads", () => {
    const store = new DataGovernanceStore({ defaultTtlMs: 5_000 });
    const rec = store.ingest(
      "tenant-a",
      "us-east-1",
      "id-1",
      {
        email: "alice@example.com",
        profile: {
          phone: "555-123-4567",
          note: "card 4111 1111 1111 1111",
        },
      },
      { nowMs: 1000 },
    );

    expect(rec.piiDetected).toBe(true);
    expect(rec.piiFindings.length).toBeGreaterThan(0);
    expect(rec.payload).toEqual({
      email: "[REDACTED]",
      profile: {
        phone: "[REDACTED]",
        note: "[REDACTED]",
      },
    });
  });

  it("honors retention TTL and legal hold during purge", () => {
    const store = new DataGovernanceStore({ defaultTtlMs: 100 });
    store.ingest("tenant-a", "us-east-1", "keep", { x: 1 }, { nowMs: 1000 });
    store.ingest("tenant-a", "us-east-1", "hold", { x: 2 }, { nowMs: 1000 });

    store.setLegalHold("tenant-a", "us-east-1", "hold", { nowMs: 1050, actor: "legal" });
    const purged = store.purgeExpired(1105, "janitor");

    expect(purged).toBe(1);
    expect(store.get("tenant-a", "us-east-1", "keep", { nowMs: 1105 })).toBeUndefined();
    expect(store.get("tenant-a", "us-east-1", "hold", { nowMs: 1105 })).toBeDefined();

    store.releaseLegalHold("tenant-a", "us-east-1", "hold", { nowMs: 1200, actor: "legal" });
    const purgedAfterRelease = store.purgeExpired(1201, "janitor");
    expect(purgedAfterRelease).toBe(1);
  });

  it("logs every access event", () => {
    const store = new DataGovernanceStore({ defaultTtlMs: 1_000 });
    store.ingest("tenant-a", "us-east-1", "id-1", { email: "alice@example.com" }, { nowMs: 1000, actor: "writer" });
    store.get("tenant-a", "us-east-1", "id-1", { nowMs: 1001, actor: "reader" });
    store.listByPartition("tenant-a", "us-east-1", { nowMs: 1002, actor: "reader" });
    store.setLegalHold("tenant-a", "us-east-1", "id-1", { nowMs: 1003, actor: "legal" });
    store.releaseLegalHold("tenant-a", "us-east-1", "id-1", { nowMs: 1004, actor: "legal" });
    store.purgeExpired(3000, "janitor");

    expect(store.getAccessLog().map((e) => e.action)).toEqual([
      "write",
      "read",
      "list",
      "legal_hold_set",
      "legal_hold_released",
      "purge",
    ]);
  });
});
