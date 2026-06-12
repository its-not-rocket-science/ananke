import { describe, it, expect } from "vitest";
import { computePackChecksum } from "../src/content-pack.js";

describe("computePackChecksum portability", () => {
  it("produces the expected SHA-256 checksum for a canonicalized manifest", () => {
    const manifest = {
      name: "portable-pack",
      version: "1.0.0",
      registry: {
        checksum: "will-be-blanked",
      },
      weapons: [{ id: "club", name: "Club", mass_kg: 1.2, damage: { blunt: 10 } }],
    };

    expect(computePackChecksum(manifest)).toBe("bcc566256ee5dfd97875d7f9816c8a7dbdc390513014cae25c455fb2abec8a0e");
  });
});
