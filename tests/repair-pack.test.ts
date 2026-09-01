import { describe, expect, it } from "vitest";

import {
  canVerifyClosure,
  demoEvidence,
  fallbackRepairPack,
  packFingerprint,
  RepairPackSchema,
  runDeterministicReplay,
} from "@/lib/repair-pack";

describe("Repair Pack contract", () => {
  it("keeps the demo evidence count internally consistent", () => {
    const count = demoEvidence.symptoms.reduce((sum, symptom) => sum + symptom.count, 0);
    expect(count).toBe(demoEvidence.totalEvents);
  });

  it("validates the governed fallback pack", () => {
    expect(RepairPackSchema.parse(fallbackRepairPack)).toEqual(fallbackRepairPack);
    expect(fallbackRepairPack.governance.agentMustNot).toContain(
      "Approve its own repair package.",
    );
  });

  it("runs every declared replay test deterministically", () => {
    const first = runDeterministicReplay(fallbackRepairPack);
    const second = runDeterministicReplay(fallbackRepairPack);

    expect(first).toEqual(second);
    expect(first).toHaveLength(fallbackRepairPack.replayTests.length);
    expect(first.every((result) => result.status === "passed")).toBe(true);
  });

  it("does not permit closure before both replay and human approval", () => {
    const results = runDeterministicReplay(fallbackRepairPack);

    expect(
      canVerifyClosure({
        approved: false,
        replayResults: results,
        pack: fallbackRepairPack,
      }),
    ).toBe(false);

    expect(
      canVerifyClosure({
        approved: true,
        replayResults: [],
        pack: fallbackRepairPack,
      }),
    ).toBe(false);

    expect(
      canVerifyClosure({
        approved: true,
        replayResults: results,
        pack: fallbackRepairPack,
      }),
    ).toBe(true);
  });

  it("binds approval to the exact pack content", () => {
    const original = packFingerprint(fallbackRepairPack);
    const changed = packFingerprint({
      ...fallbackRepairPack,
      title: `${fallbackRepairPack.title} — changed`,
    });

    expect(original).toMatch(/^rp_[0-9a-f]{8}$/);
    expect(changed).not.toBe(original);
  });
});


