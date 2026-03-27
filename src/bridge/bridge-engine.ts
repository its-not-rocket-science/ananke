// src/bridge/bridge‑engine.ts — Main bridge engine (double‑buffered, interpolating)

import type { BridgeConfig, TickSnapshot, InterpolatedState, MappedPoseModifier } from "./types.js";
import type { RigSnapshot } from "../model3d.js";
import type { MotionVector, ConditionSample } from "../debug.js";
import type { Q } from "../units.js";
import { SCALE } from "../units.js";
import { DT_S } from "../sim/tick.js";
import { lerpVec3, slerpFacing, interpolatePoseModifiers, interpolateAnimationHints, interpolateCondition } from "./interpolation.js";
import { findBodyPlanMapping, mapPoseModifiers } from "./mapping.js";

// ─── Internal storage ──────────────────────────────────────────────────────────

interface EntityRecord {
  /** Body plan ID (e.g., "humanoid", "quadruped") */
  bodyPlanId: string;
  /** Previous tick snapshot (tick = prevTick) */
  prev: TickSnapshot | null;
  /** Current tick snapshot (tick = currentTick) */
  curr: TickSnapshot | null;
}

// ─── BridgeEngine ─────────────────────────────────────────────────────────────

export class BridgeEngine {
  private config: BridgeConfig;
  private entities = new Map<number, EntityRecord>();
  /** Simulation time of the previous snapshot (seconds) */
  private prevTime_s: number = 0;
  /** Simulation time of the current snapshot (seconds) */
  private currTime_s: number = 0;
  /** Corresponding tick numbers */
  private prevTick: number = 0;
  private currTick: number = 0;
  /** Default bone name for unmapped segments */
  private defaultBoneName: string;

  constructor(config: BridgeConfig) {
    this.config = config;
    this.defaultBoneName = config.defaultBoneName ?? "root";
  }

  // ─── Configuration ───────────────────────────────────────────────────────────

  /** Update the bridge configuration (does not affect already stored snapshots). */
  updateConfig(config: BridgeConfig): void {
    this.config = config;
    this.defaultBoneName = config.defaultBoneName ?? "root";
  }

  /** Register or update the body plan ID for an entity. */
  setEntityBodyPlan(entityId: number, bodyPlanId: string): void {
    let rec = this.entities.get(entityId);
    if (!rec) {
      rec = { bodyPlanId, prev: null, curr: null };
      this.entities.set(entityId, rec);
    } else {
      rec.bodyPlanId = bodyPlanId;
    }
  }

  // ─── Tick data ingestion ────────────────────────────────────────────────────

  /**
   * Ingests new simulation tick data.
   * Called at simulation rate (typically 20 Hz).
   * @param snapshots Rig snapshots from extractRigSnapshots()
   * @param motion Motion vectors from extractMotionVectors() (optional)
   * @param condition Condition samples from extractConditionSamples() (optional)
   */
  update(
    snapshots: RigSnapshot[],
    motion?: MotionVector[],
    condition?: ConditionSample[],
  ): void {
    // Shift current → previous
    for (const rec of this.entities.values()) {
      rec.prev = rec.curr;
      rec.curr = null;
    }

    // Update simulation time: assume each tick advances by DT_S
    if (this.currTick > 0) {
      this.prevTime_s = this.currTime_s;
      this.prevTick = this.currTick;
    }
    // Use the first snapshot's tick as reference (all snapshots share same tick)
    const tick = snapshots[0]?.tick ?? this.currTick + 1;
    this.currTick = tick;
    this.currTime_s = tick * (DT_S / SCALE.s); // convert fixed‑point seconds to real seconds

    // Merge data into TickSnapshot per entity
    const motionMap = new Map<number, MotionVector>();
    const conditionMap = new Map<number, ConditionSample>();
    if (motion) for (const m of motion) motionMap.set(m.entityId, m);
    if (condition) for (const c of condition) conditionMap.set(c.entityId, c);

    for (const rig of snapshots) {
      const mv = motionMap.get(rig.entityId);
      const cond = conditionMap.get(rig.entityId);
      const snapshot: TickSnapshot = {
        entityId: rig.entityId,
        teamId: rig.teamId,
        tick: rig.tick,
        position_m: mv?.position_m ?? { x: 0, y: 0, z: 0 },
        velocity_mps: mv?.velocity_mps ?? { x: 0, y: 0, z: 0 },
        facing: mv?.facing ?? { x: SCALE.Q, y: 0, z: 0 }, // default forward
        animation: rig.animation,
        poseModifiers: rig.pose,
        grapple: rig.grapple,
        condition: {
          shockQ: cond?.shock ?? rig.animation.shockQ,
          fearQ: cond?.fearQ ?? rig.animation.fearQ,
          consciousness: cond?.consciousness ?? SCALE.Q,
          fluidLoss: cond?.fluidLoss ?? 0,
          dead: cond?.dead ?? rig.animation.dead,
        },
      };

      let rec = this.entities.get(rig.entityId);
      if (!rec) {
        // Body plan unknown; default to humanoid (host should call setEntityBodyPlan)
        rec = { bodyPlanId: "humanoid", prev: null, curr: snapshot };
        this.entities.set(rig.entityId, rec);
      } else {
        rec.curr = snapshot;
      }
    }

    // Cleanup entities that disappeared (optional)
  }

  // ─── Interpolated state retrieval ───────────────────────────────────────────

  /**
   * Compute interpolated state for an entity at a given render time.
   * @param entityId Entity ID
   * @param renderTime_s Render time in real seconds (monotonically increasing)
   * @returns Interpolated state, or null if entity not found or insufficient data
   */
  getInterpolatedState(entityId: number, renderTime_s: number): InterpolatedState | null {
    const rec = this.entities.get(entityId);
    if (!rec) {
      return null;
    }

    // Determine which snapshots are available
    const prev = rec.prev;
    const curr = rec.curr;
    if (!prev && !curr) {
      return null;
    }

    // If only one snapshot is available, treat it as both prev and curr (hold)
    const usePrev = prev ?? curr!;
    const useCurr = curr ?? prev!;
    const singleSnapshot = !prev || !curr;

    // Find mapping; if none, fall back to default bone name (still produce state)
    const mapping = findBodyPlanMapping(this.config, rec.bodyPlanId);

    // Determine interpolation factor t ∈ [0, SCALE.Q]
    let t: Q;
    let fromTick: number;
    let toTick: number;
    let mode: "lerp" | "extrapolate" | "hold";

    if (singleSnapshot) {
      // Only one snapshot: hold it regardless of render time
      t = SCALE.Q;
      fromTick = useCurr.tick;
      toTick = useCurr.tick;
      mode = "hold";
    } else {
      // Both snapshots available
      if (renderTime_s <= this.prevTime_s) {
        // Render time before previous snapshot: hold previous
        t = 0;
        fromTick = prev!.tick;
        toTick = prev!.tick;
        mode = "hold";
      } else if (renderTime_s >= this.currTime_s) {
        // Render time at or after current snapshot
        if (this.config.extrapolationAllowed) {
          // Extrapolate forward using velocity
          t = SCALE.Q;
          fromTick = curr!.tick;
          toTick = curr!.tick;
          mode = "extrapolate";
        } else {
          // Hold current snapshot
          t = SCALE.Q;
          fromTick = curr!.tick;
          toTick = curr!.tick;
          mode = "hold";
        }
      } else {
        // Normal interpolation between prev and curr
        const interval = this.currTime_s - this.prevTime_s;
        if (interval <= 0) {
          t = SCALE.Q;
        } else {
          const frac = (renderTime_s - this.prevTime_s) / interval;
          t = Math.max(0, Math.min(SCALE.Q, Math.round(frac * SCALE.Q))) as Q;
        }
        fromTick = prev!.tick;
        toTick = curr!.tick;
        mode = "lerp";
      }
    }

    // Interpolate each component (if single snapshot, lerp with t = SCALE.Q yields curr)
    const position_m = lerpVec3(usePrev.position_m, useCurr.position_m, t);
    const velocity_mps = lerpVec3(usePrev.velocity_mps, useCurr.velocity_mps, t);
    const facing = slerpFacing(usePrev.facing, useCurr.facing, t);
    const animation = interpolateAnimationHints(usePrev.animation, useCurr.animation, t);
    const pose = interpolatePoseModifiers(usePrev.poseModifiers, useCurr.poseModifiers, t);
    const condition = interpolateCondition(usePrev.condition, useCurr.condition, t);

    // Apply extrapolation if needed
    if (mode === "extrapolate" && this.config.extrapolationAllowed) {
      const delta = renderTime_s - this.currTime_s;
      const deltaFixed = Math.round(delta * SCALE.s);
      const dx = Math.trunc((curr!.velocity_mps.x * deltaFixed) / SCALE.s);
      const dy = Math.trunc((curr!.velocity_mps.y * deltaFixed) / SCALE.s);
      const dz = Math.trunc((curr!.velocity_mps.z * deltaFixed) / SCALE.s);
      position_m.x += dx;
      position_m.y += dy;
      position_m.z += dz;
    }

    // Map pose modifiers to bone names
    const mappedPose: MappedPoseModifier[] = mapping
      ? mapPoseModifiers(pose, mapping, this.defaultBoneName)
      : pose.map(p => ({
          segmentId: p.segmentId,
          boneName: this.defaultBoneName,
          impairmentQ: p.impairmentQ,
          structuralQ: p.structuralQ,
          surfaceQ: p.surfaceQ,
        }));

    return {
      entityId,
      teamId: usePrev.teamId,
      position_m,
      velocity_mps,
      facing,
      animation,
      poseModifiers: mappedPose,
      grapple: t < SCALE.Q / 2 ? usePrev.grapple : useCurr.grapple,
      condition,
      interpolationFactor: t,
      fromTick,
      toTick,
    };
  }

  // ─── Utilities ───────────────────────────────────────────────────────────────

  /** Get the simulation time (seconds) of the latest tick. */
  getLatestSimTime(): number {
    return this.currTime_s;
  }

  /** Get the simulation tick of the latest snapshot. */
  getLatestTick(): number {
    return this.currTick;
  }

  /** Check if an entity has at least one snapshot. */
  hasEntity(entityId: number): boolean {
    const rec = this.entities.get(entityId);
    return !!(rec && (rec.prev || rec.curr));
  }

  /** Remove an entity from the bridge (e.g., after death and removal from sim). */
  removeEntity(entityId: number): void {
    this.entities.delete(entityId);
  }

  /** Clear all stored snapshots (reset). */
  clear(): void {
    this.entities.clear();
    this.prevTime_s = 0;
    this.currTime_s = 0;
    this.prevTick = 0;
    this.currTick = 0;
  }
}