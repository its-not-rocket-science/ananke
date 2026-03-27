/**
 * CE-11 — Network Replication Reference Implementation tests
 *
 * Integration tests that spin up a real HTTP/WebSocket server on port 0 (OS-assigned)
 * and exercise the replication protocol end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import * as net  from "node:net";
import * as crypto from "node:crypto";

import {
  createReplicationServer,
  wsDecodeFrame,
  wsEncodeMaskedText,
  wsAcceptKey,
  worldToJson,
  type ReplicationServer,
} from "../tools/replication-server.js";
import { unpackDiff } from "../src/snapshot.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Start a server on a random OS-assigned port, returns { srv, port }. */
async function startServer(cfg = {}): Promise<{ srv: ReplicationServer; port: number }> {
  const srv = createReplicationServer(cfg);
  await new Promise<void>(resolve => srv.httpServer.listen(0, "127.0.0.1", resolve));
  const addr = srv.httpServer.address() as net.AddressInfo;
  return { srv, port: addr.port };
}

/** Make an HTTP request and return { status, body }. */
async function httpRequest(
  method: string,
  port: number,
  path: string,
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: "127.0.0.1", port, path, method,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    };
    const req = http.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Open a WebSocket to ws://127.0.0.1:port/ws and return received messages. */
async function wsConnect(port: number): Promise<{
  messages: () => Record<string, unknown>[];
  send: (msg: unknown) => void;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const received: Record<string, unknown>[] = [];

    const wsKey     = crypto.randomBytes(16).toString("base64");
    const acceptKey = wsAcceptKey(wsKey);

    let upgraded = false;
    let buf       = Buffer.alloc(0);

    socket.on("connect", () => {
      socket.write(
        `GET /ws HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${wsKey}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`
      );
    });

    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);

      if (!upgraded) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = buf.slice(0, headerEnd).toString();
        if (!header.includes(acceptKey)) { reject(new Error("WS handshake failed")); return; }
        buf      = buf.slice(headerEnd + 4);
        upgraded = true;
        socket.off("error", reject);
        socket.on("error", () => { /* ignore post-upgrade errors (e.g. server close) */ });
        resolve({ messages: () => received, send, close });
      }

      // Parse frames
      while (buf.length >= 2) {
        const frame = wsDecodeFrame(buf);
        if (!frame) break;
        if (frame.opcode === 0x1) { // text
          try { received.push(JSON.parse(frame.payload.toString("utf8")) as Record<string, unknown>); }
          catch { /* ignore malformed */ }
        }
        buf = buf.slice(frame.frameBytes);
      }
    });

    socket.on("error", reject);

    function send(msg: unknown): void {
      socket.write(wsEncodeMaskedText(JSON.stringify(msg)));
    }

    function close(): void {
      try { socket.write(Buffer.from([0x88, 0x00])); } catch { /**/ }
      socket.destroy();
    }
  });
}

/** Wait up to `ms` for `predicate` to be true, polling every 20 ms. */
async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitFor timed out`);
    await new Promise(r => setTimeout(r, 20));
  }
}

// ── wsDecodeFrame unit tests ───────────────────────────────────────────────────

describe("wsDecodeFrame", () => {
  it("decodes a small unmasked text frame", () => {
    const payload = Buffer.from("hello");
    const frame   = Buffer.concat([Buffer.from([0x81, 0x05]), payload]);
    const result  = wsDecodeFrame(frame)!;
    expect(result).not.toBeNull();
    expect(result.opcode).toBe(0x1);
    expect(result.payload.toString()).toBe("hello");
    expect(result.frameBytes).toBe(7);
  });

  it("decodes a masked text frame", () => {
    const text    = "hi";
    const frame   = wsEncodeMaskedText(text);
    // Unmask by feeding back through decoder
    const result  = wsDecodeFrame(frame)!;
    expect(result).not.toBeNull();
    expect(result.payload.toString("utf8")).toBe("hi");
  });

  it("returns null for incomplete frame (too short)", () => {
    expect(wsDecodeFrame(Buffer.from([0x81]))).toBeNull();
  });

  it("returns null when payload not yet fully received", () => {
    // Frame claims 10 bytes payload but buffer only has 3
    const frame = Buffer.from([0x81, 10, 0x61, 0x61, 0x61]); // 3 bytes of 10
    expect(wsDecodeFrame(frame)).toBeNull();
  });

  it("decodes a 16-bit extended-length frame (payLen=126)", () => {
    const payload = Buffer.alloc(130, 0x41); // 130 × 'A'
    const header  = Buffer.from([0x81, 126, 0, 130]);
    const frame   = Buffer.concat([header, payload]);
    const result  = wsDecodeFrame(frame)!;
    expect(result.payload.length).toBe(130);
    expect(result.frameBytes).toBe(4 + 130);
  });

  it("frameBytes accounts for mask key", () => {
    const text   = "test";
    const frame  = wsEncodeMaskedText(text);
    const result = wsDecodeFrame(frame)!;
    // 2 header + 4 mask + 4 payload = 10
    expect(result.frameBytes).toBe(10);
  });

  it("decodes a ping frame (opcode 0x9)", () => {
    const frame  = Buffer.from([0x89, 0x00]);
    const result = wsDecodeFrame(frame)!;
    expect(result.opcode).toBe(0x9);
    expect(result.payload.length).toBe(0);
  });

  it("decodes a close frame (opcode 0x8)", () => {
    const frame  = Buffer.from([0x88, 0x00]);
    const result = wsDecodeFrame(frame)!;
    expect(result.opcode).toBe(0x8);
  });
});

// ── wsAcceptKey ────────────────────────────────────────────────────────────────

describe("wsAcceptKey", () => {
  it("produces the RFC 6455 test vector", () => {
    // From RFC 6455 §1.3
    const key    = "dGhlIHNhbXBsZSBub25jZQ==";
    const accept = wsAcceptKey(key);
    expect(accept).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });
});

// ── worldToJson ────────────────────────────────────────────────────────────────

describe("worldToJson", () => {
  it("converts Map values to objects", () => {
    const fakeWorld = {
      tick: 1, seed: 1, entities: [],
      someMap: new Map([["a", 1], ["b", 2]]),
    };
    const result = worldToJson(fakeWorld as never) as Record<string, unknown>;
    expect(result.someMap).toEqual({ a: 1, b: 2 });
  });

  it("converts Set values to arrays", () => {
    const fakeWorld = {
      tick: 1, seed: 1, entities: [],
      someSet: new Set([3, 4, 5]),
    };
    const result = worldToJson(fakeWorld as never) as Record<string, unknown>;
    expect(Array.isArray(result.someSet)).toBe(true);
    expect((result.someSet as number[]).sort((a, b) => a - b)).toEqual([3, 4, 5]);
  });
});

// ── HTTP endpoints ─────────────────────────────────────────────────────────────

describe("HTTP /state", () => {
  let srv: ReplicationServer;
  let port: number;

  beforeEach(async () => { ({ srv, port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("returns 200 with tick and state", async () => {
    const { status, body } = await httpRequest("GET", port, "/state");
    expect(status).toBe(200);
    const json = JSON.parse(body) as { tick: number; state: { entities: unknown[] } };
    expect(json.tick).toBe(0);
    expect(Array.isArray(json.state.entities)).toBe(true);
  });

  it("state contains 16 entities (8v8)", async () => {
    const { body } = await httpRequest("GET", port, "/state");
    const json = JSON.parse(body) as { state: { entities: unknown[] } };
    expect(json.state.entities).toHaveLength(16);
  });

  it("tick increments after doTick()", async () => {
    srv.doTick();
    const { body } = await httpRequest("GET", port, "/state");
    const json = JSON.parse(body) as { tick: number };
    expect(json.tick).toBe(1);
  });
});

describe("HTTP /stats", () => {
  let srv: ReplicationServer;
  let port: number;

  beforeEach(async () => { ({ srv, port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("returns 200 with expected fields", async () => {
    const { status, body } = await httpRequest("GET", port, "/stats");
    expect(status).toBe(200);
    const json = JSON.parse(body) as Record<string, unknown>;
    expect(json).toHaveProperty("tick");
    expect(json).toHaveProperty("entities");
    expect(json).toHaveProperty("liveEntities");
    expect(json).toHaveProperty("graceTicks");
    expect(json).toHaveProperty("snapshotInterval");
    expect(json).toHaveProperty("wsClients");
  });

  it("wsClients is 0 with no connections", async () => {
    const { body } = await httpRequest("GET", port, "/stats");
    const json = JSON.parse(body) as { wsClients: number };
    expect(json.wsClients).toBe(0);
  });

  it("reflects custom graceTicks config", async () => {
    await srv.stop();
    ({ srv, port } = await startServer({ graceTicks: 7 }));
    const { body } = await httpRequest("GET", port, "/stats");
    const json = JSON.parse(body) as { graceTicks: number };
    expect(json.graceTicks).toBe(7);
  });
});

describe("HTTP /command", () => {
  let srv: ReplicationServer;
  let port: number;

  beforeEach(async () => { ({ srv, port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("returns 400 for missing entityId", async () => {
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ intent: { verb: "defend" } }));
    expect(status).toBe(400);
  });

  it("returns 400 for missing intent", async () => {
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1 }));
    expect(status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const { status } = await httpRequest("POST", port, "/command", "not json");
    expect(status).toBe(400);
  });

  it("returns 202 for a valid command", async () => {
    const { status, body } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" } }));
    expect(status).toBe(202);
    const json = JSON.parse(body) as { queued: boolean };
    expect(json.queued).toBe(true);
  });

  it("returns 409 for a stale command (lag > graceTicks)", async () => {
    // Advance server to tick 10, then send tickHint=0 (lag=10 > default graceTicks=3)
    for (let i = 0; i < 10; i++) srv.doTick();
    const { status, body } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" }, tickHint: 0 }));
    expect(status).toBe(409);
    const json = JSON.parse(body) as { error: string; lag: number };
    expect(json.error).toBe("stale");
    expect(json.lag).toBe(10);
  });

  it("accepts a command within the grace window", async () => {
    for (let i = 0; i < 2; i++) srv.doTick();
    // tickHint=0, serverTick=2, lag=2 ≤ graceTicks=3 → accepted
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" }, tickHint: 0 }));
    expect(status).toBe(202);
  });

  it("accepts command exactly at grace boundary", async () => {
    for (let i = 0; i < 3; i++) srv.doTick();
    // lag=3 === graceTicks=3 → accepted
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" }, tickHint: 0 }));
    expect(status).toBe(202);
  });

  it("rejects command one tick beyond grace boundary", async () => {
    for (let i = 0; i < 4; i++) srv.doTick();
    // lag=4 > graceTicks=3 → rejected
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" }, tickHint: 0 }));
    expect(status).toBe(409);
  });

  it("command without tickHint is always accepted regardless of server tick", async () => {
    for (let i = 0; i < 100; i++) srv.doTick();
    const { status } = await httpRequest("POST", port, "/command",
      JSON.stringify({ entityId: 1, intent: { verb: "defend" } }));
    expect(status).toBe(202);
  });
});

describe("HTTP unknown routes", () => {
  let srv: ReplicationServer;
  let port: number;

  beforeEach(async () => { ({ srv, port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("returns 404 for unknown path", async () => {
    const { status } = await httpRequest("GET", port, "/unknown");
    expect(status).toBe(404);
  });

  it("OPTIONS returns 204 (CORS preflight)", async () => {
    const { status } = await httpRequest("OPTIONS", port, "/command");
    expect(status).toBe(204);
  });
});

// ── WebSocket protocol ────────────────────────────────────────────────────────

describe("WebSocket protocol", () => {
  let srv: ReplicationServer;
  let port: number;

  beforeEach(async () => { ({ srv, port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("sends init message on connect with tick=0 and entities", async () => {
    const { messages, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);
    const init = messages()[0]!;
    expect(init.type).toBe("init");
    expect(init.tick).toBe(0);
    const state = init.state as { entities: unknown[] };
    expect(state.entities).toHaveLength(16);
    close();
  });

  it("wsClients count increases on WS connect", async () => {
    const { close } = await wsConnect(port);
    await waitFor(() => srv.getStats().wsClients === 1);
    expect(srv.getStats().wsClients).toBe(1);
    close();
  });

  it("sends tick message after doTick()", async () => {
    const { messages, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1); // init

    srv.doTick();
    await waitFor(() => messages().length >= 2);

    const msg = messages()[1]!;
    // First tick after init: diff should be non-empty so type is "tick" or "snapshot"
    expect(["tick", "snapshot"]).toContain(msg.type);
    expect(msg.tick).toBe(1);
    close();
  });

  it("tick message carries tick number", async () => {
    const { messages, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);

    for (let i = 0; i < 3; i++) srv.doTick();
    await waitFor(() => messages().length >= 4);

    const last = messages().at(-1)!;
    expect(last.tick).toBe(3);
    close();
  });

  it("snapshot message is sent at snapshotInterval", async () => {
    await srv.stop();
    ({ srv, port } = await startServer({ snapshotInterval: 3 }));
    const { messages, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);

    for (let i = 0; i < 3; i++) srv.doTick();
    await waitFor(() => messages().length >= 4);

    const snapshots = messages().filter(m => m.type === "snapshot");
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const snap = snapshots[0]!;
    expect(snap.tick).toBe(3);
    expect(snap).toHaveProperty("state");
    close();
  });

  it("diff message carries a base64-encoded CE-9 binary diff", async () => {
    // Use snapshotInterval=100 so first tick sends a diff, not a snapshot
    await srv.stop();
    ({ srv, port } = await startServer({ snapshotInterval: 100 }));
    const { messages, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);

    srv.doTick();
    await waitFor(() => messages().length >= 2);

    const tickMsg = messages().find(m => m.type === "tick");
    if (tickMsg) {
      expect(typeof tickMsg.diff).toBe("string");
      // Must be valid base64 that decodes to a valid CE-9 diff
      const bytes = Buffer.from(tickMsg.diff as string, "base64");
      const diff  = unpackDiff(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      expect(diff).toHaveProperty("tick");
      expect(diff).toHaveProperty("worldChanges");
      expect(diff).toHaveProperty("added");
      expect(diff).toHaveProperty("removed");
      expect(diff).toHaveProperty("modified");
    }
    close();
  });

  it("sends command_dropped over WS for stale command", async () => {
    const { messages, send, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);

    for (let i = 0; i < 10; i++) srv.doTick();
    await waitFor(() => messages().some(m => m.type === "tick" || m.type === "snapshot"));

    send({ type: "command", entityId: 1, intent: { verb: "defend" }, tickHint: 0 });
    await waitFor(() => messages().some(m => m.type === "command_dropped"), 1000);

    const dropped = messages().find(m => m.type === "command_dropped")!;
    expect(dropped.reason).toBe("stale");
    close();
  });

  it("queues WS command for next tick (no drop when within grace window)", async () => {
    const { messages, send, close } = await wsConnect(port);
    await waitFor(() => messages().length >= 1);

    send({ type: "command", entityId: 1, intent: { verb: "defend" }, tickHint: 0 });
    // Allow a moment for processing
    await new Promise(r => setTimeout(r, 50));

    // Should NOT receive command_dropped
    const dropped = messages().find(m => m.type === "command_dropped");
    expect(dropped).toBeUndefined();
    close();
  });
});

// ── getStats / getWorld ────────────────────────────────────────────────────────

describe("ReplicationServer API", () => {
  let srv: ReplicationServer;
  let _port: number;

  beforeEach(async () => { ({ srv, port: _port } = await startServer()); });
  afterEach(async () => { await srv.stop(); });

  it("getWorld() returns the live world state", () => {
    const w = srv.getWorld();
    expect(w.entities).toHaveLength(16);
    expect(w.tick).toBe(0);
  });

  it("getWorld().tick advances after doTick()", () => {
    srv.doTick();
    expect(srv.getWorld().tick).toBe(1);
  });

  it("getStats().entities equals team size × 2", () => {
    const stats = srv.getStats();
    expect(stats.entities).toBe(16);
  });

  it("getStats().liveEntities starts equal to entities", () => {
    const stats = srv.getStats();
    expect(stats.liveEntities).toBe(stats.entities);
  });

  it("doTick() does not throw after many ticks", () => {
    expect(() => { for (let i = 0; i < 50; i++) srv.doTick(); }).not.toThrow();
  });

  it("custom teamSize=4 creates 8 entities total", async () => {
    await srv.stop();
    ({ srv, port: _port } = await startServer({ teamSize: 4 }));
    expect(srv.getWorld().entities).toHaveLength(8);
    expect(srv.getStats().entities).toBe(8);
  });
});
