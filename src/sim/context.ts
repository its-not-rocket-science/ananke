import { SimulationTuning } from "./tuning.js";
import type { TraceSink } from "./trace.js";
import type { TerrainGrid } from "./terrain.js";
import type { DensityField } from "./density.js";
import type { SensoryEnvironment } from "./sensory.js";
import type { ObstacleGrid, ElevationGrid,  SlopeGrid, HazardGrid } from "./terrain.js";
import type { TechContext } from "./tech.js";
import type { WeatherState } from "./weather.js";
import type { Q, I32 } from "../units.js";
import type { BiomeContext } from "./biome.js";

export interface KernelContext {
  tractionCoeff: Q;
  tuning?: SimulationTuning;
  cellSize_m?: I32; // fixed-point metres; default 4m
  density?: DensityField;

  trace?: TraceSink;

  /** Phase 4: ambient sensory conditions. Defaults to DEFAULT_SENSORY_ENV (full daylight, clear). */
  sensoryEnv?: SensoryEnvironment;

  /** Phase 6: per-cell terrain grid. When provided, traction is looked up by entity position. */
  terrainGrid?: TerrainGrid;

  /** Phase 6: impassable and partial-cover cells.  q(1.0) = fully impassable; q(0.5) = 50% cover. */
  obstacleGrid?: ObstacleGrid;

  /** Phase 6: height above ground level per cell (SCALE.m units). Affects melee reach and projectile range. */
  elevationGrid?: ElevationGrid;

  /** Phase 6: per-cell slope direction and grade.  Modifies effective sprint speed. */
  slopeGrid?: SlopeGrid;

  /** Phase 6: dynamic hazard cells (fire, radiation, poison_gas). Damage applied per tick. */
  hazardGrid?: HazardGrid;

  /**
   * Phase 10: ambient temperature (Q 0..1).
   * Comfort range: [q(0.35), q(0.65)].
   * Above q(0.65) → heat stress (shock + surface damage); below q(0.35) → cold stress (shock + fatigue).
   * Entity attributes `heatTolerance` and `coldTolerance` scale the dose.
   */
  ambientTemperature_Q?: Q;

  /**
   * Phase 11: technology context.
   * When provided, gates which items are available.
   * Does not directly affect simulation physics — use validateLoadout() before stepWorld
   * to verify that the entity's loadout is era-appropriate.
   */
  techCtx?: TechContext;

  /**
   * Phase 12: ambient energy grid.
   * Maps terrain cell keys to ambient energy fraction (Q, 0..1).
   * Used by CapabilitySource regenModel "ambient" — regen rate scales with cell value.
   * Ley lines, geothermal vents, solar collectors, stellar wind.
   */
  ambientGrid?: Map<string, Q>;

  /**
   * Phase 12B: terrain tag grid.
   * Maps cell keys to arrays of string tags; used by CapabilitySource "event" regenModel
   * { on: "terrain"; tag: string } triggers — fires once per cell-boundary crossing.
   */
  terrainTagGrid?: Map<string, string[]>;

  /**
   * Phase 29: ambient temperature in the Phase 29 Q encoding.
   * q(0.5) = 37°C (comfortable); cToQ(0) ≈ -1852 (0°C); cToQ(30) ≈ 3704 (30°C).
   * When absent, stepCoreTemp is not called and core temperature is not updated.
   */
  thermalAmbient_Q?: Q;

  /**
   * Phase 51: current weather conditions.
   * When present, deriveWeatherModifiers() applies per-tick modifiers to
   * tractionCoeff, sensoryEnv, thermalAmbient_Q, and ranged aim error.
   * When absent, weather has no effect (backward-compatible).
   */
  weather?: WeatherState;

  /**
   * Phase 68: biome physics overrides.
   * When present, adjusts gravity (jump height, traction), thermal resistance,
   * sound propagation, and velocity drag for all entities this tick.
   * When absent, standard Earth-surface physics apply.
   */
  biome?: BiomeContext;
}