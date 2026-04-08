import type { WorldState } from "../world.js";
import { type Entity } from "../entity.js";
import type { TreatCommand } from "../commands.js";
import type { KernelContext } from "../context.js";
import { SCALE, clampQ, mulDiv, q, type Q } from "../../units.js";
import { FRACTURE_THRESHOLD } from "../injury.js";
import { TIER_RANK, TIER_MUL, ACTION_MIN_TIER, TIER_TECH_REQ } from "../medical.js";
import { getSkill } from "../skills.js";
import type { WorldIndex } from "../indexing.js";
import type { TraceSink } from "../trace.js";
import { TraceKinds } from "../kinds.js";

type ResolveTreatOptions = {
  world: WorldState;
  treater: Entity;
  cmd: TreatCommand;
  index: WorldIndex;
  trace: TraceSink;
  ctx: KernelContext;
};

export function resolveTreat(options: ResolveTreatOptions): void {
  const { world, treater, cmd, index, trace, ctx } = options;
  if (treater.injury.dead) return;

  const target = index.byId.get(cmd.targetId);
  if (!target || target.injury.dead) return;

  const dx = target.position_m.x - treater.position_m.x;
  const dy = target.position_m.y - treater.position_m.y;
  const dist2 = dx * dx + dy * dy;
  const MAX_TREAT_DIST_m = Math.trunc(2 * SCALE.m);
  if (dist2 > MAX_TREAT_DIST_m * MAX_TREAT_DIST_m) return;

  const tierRank = TIER_RANK[cmd.tier];
  const actionMinRank = TIER_RANK[ACTION_MIN_TIER[cmd.action]];
  if (tierRank < actionMinRank) return;

  const techReq = TIER_TECH_REQ[cmd.tier];
  if (techReq && ctx.techCtx && !ctx.techCtx.available.has(techReq)) return;

  const tierMul = TIER_MUL[cmd.tier];
  const medSkill = getSkill(treater.skills, "medical");
  const effectMul: Q = mulDiv(tierMul, medSkill.treatmentRateMul, SCALE.Q) as Q;

  if (cmd.action === "tourniquet") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    reg.bleedingRate = q(0);
    reg.bleedDuration_ticks = 0;
    target.injury.shock = clampQ(target.injury.shock + q(0.005), 0, SCALE.Q);

  } else if (cmd.action === "bandage") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    const BASE_BANDAGE_RATE: Q = q(0.0050) as Q;
    const reduction = mulDiv(BASE_BANDAGE_RATE, effectMul, SCALE.Q);
    reg.bleedingRate = clampQ((reg.bleedingRate - reduction) as Q, q(0), q(1.0));

  } else if (cmd.action === "surgery") {
    const reg = cmd.regionId ? target.injury.byRegion[cmd.regionId] : undefined;
    if (!reg) return;
    const BASE_SURGERY_RATE: Q = q(0.0020) as Q;
    const BASE_BANDAGE_RATE: Q = q(0.0050) as Q;
    const strReduction = mulDiv(BASE_SURGERY_RATE, effectMul, SCALE.Q);
    const newStr = clampQ(
      (reg.structuralDamage - strReduction) as Q,
      reg.permanentDamage,
      SCALE.Q,
    );
    reg.structuralDamage = newStr as Q;
    const bleedReduction = mulDiv(BASE_BANDAGE_RATE, effectMul, SCALE.Q);
    reg.bleedingRate = clampQ((reg.bleedingRate - bleedReduction) as Q, q(0), q(1.0));
    if (reg.fractured && reg.structuralDamage < FRACTURE_THRESHOLD) {
      reg.fractured = false;
    }
    if (reg.infectedTick >= 0 && tierRank >= TIER_RANK["surgicalKit"]) {
      reg.infectedTick = -1;
    }

  } else if (cmd.action === "fluidReplacement") {
    const BASE_FLUID_RATE: Q = q(0.0050) as Q;
    const recovery = mulDiv(BASE_FLUID_RATE, effectMul, SCALE.Q);
    target.injury.fluidLoss = clampQ((target.injury.fluidLoss - recovery) as Q, q(0), SCALE.Q);
    target.injury.shock = clampQ((target.injury.shock - q(0.002)) as Q, q(0), SCALE.Q);
  }

  trace.onEvent({
    kind: TraceKinds.TreatmentApplied,
    tick: world.tick,
    treaterId: treater.id,
    targetId: target.id,
    action: cmd.action,
    ...(cmd.regionId !== undefined ? { regionId: cmd.regionId } : {}),
  });
}
