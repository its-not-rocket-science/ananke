import { SCALE } from "../units.js";

export type NarrativeVerbosity = "tactical" | "cinematic";

export interface NarrativeActionContext {
  attackerName?: string;
  targetName?: string;
  terrain?: string;
  weather?: string;
  weaponName?: string;
  distance_m?: number;
  causes?: string[];
}

export interface CombatAction {
  kind: "melee" | "ranged" | "morale" | "status";
  hit?: boolean;
  damage?: number;
  blocked?: boolean;
  parried?: boolean;
  shieldBlocked?: boolean;
  region?: string;
  critical?: boolean;
  suppressed?: boolean;
}

export interface DescribeActionOptions {
  verbosity?: NarrativeVerbosity;
}

function name(label: string | undefined, fallback: string): string {
  return label?.trim() || fallback;
}

function joinCauses(context: NarrativeActionContext): string {
  const causes = [...(context.causes ?? [])];
  if (context.terrain) causes.push(`${context.terrain} terrain`);
  if (context.weather) causes.push(context.weather);
  if (causes.length === 0) return "";
  if (causes.length === 1) return ` because of ${causes[0]}`;
  return ` because of ${causes.slice(0, -1).join(", ")} and ${causes.at(-1)}`;
}

function cinematicMelee(action: CombatAction, context: NarrativeActionContext): string {
  const attacker = name(context.attackerName, "The attacker");
  const target = name(context.targetName, "the defender");
  const weapon = context.weaponName ?? "weapon";

  if (action.hit === false) {
    return `${attacker}'s ${weapon} clangs against ${target}${action.shieldBlocked ? "'s shield" : ""} — a near miss${joinCauses(context)}!`;
  }
  if (action.blocked || action.parried || action.shieldBlocked) {
    return `${target} turns aside ${attacker}'s strike at the last instant${joinCauses(context)}.`;
  }

  const damageText = typeof action.damage === "number"
    ? ` for ${action.damage} damage`
    : "";
  const critText = action.critical ? " It's a decisive blow." : "";
  const regionText = action.region ? ` into ${target}'s ${action.region}` : " into the opening";
  return `${attacker} drives the ${weapon}${regionText}${damageText}${critText}`;
}

function tacticalMelee(action: CombatAction, context: NarrativeActionContext): string {
  const attacker = name(context.attackerName, "attacker");
  const target = name(context.targetName, "target");
  const weapon = context.weaponName ?? "weapon";

  if (action.hit === false) {
    return `${attacker} misses ${target} with ${weapon}${joinCauses(context)}.`;
  }
  if (action.blocked || action.parried || action.shieldBlocked) {
    const defense = action.parried ? "parried" : action.shieldBlocked ? "shield block" : "blocked";
    return `${attacker} attacks ${target}; ${defense}${joinCauses(context)}.`;
  }

  const distance = typeof context.distance_m === "number"
    ? ` at ${(context.distance_m / SCALE.m).toFixed(1)}m`
    : "";
  return `${attacker} hits ${target}${action.region ? ` (${action.region})` : ""} for ${action.damage ?? 0} damage${distance}.`;
}

function tacticalRanged(action: CombatAction, context: NarrativeActionContext): string {
  const shooter = name(context.attackerName, "shooter");
  const target = name(context.targetName, "target");
  const weapon = context.weaponName ?? "projectile";
  const distance = typeof context.distance_m === "number"
    ? ` at ${(context.distance_m / SCALE.m).toFixed(1)}m`
    : "";

  if (action.hit === false) {
    return `${shooter} misses ${target} with ${weapon}${distance}${joinCauses(context)}.`;
  }
  if (action.suppressed) {
    return `${shooter} suppresses ${target} with ${weapon}${distance}.`;
  }
  return `${shooter} lands a shot on ${target}${action.region ? ` (${action.region})` : ""}${distance}.`;
}

function cinematicRanged(action: CombatAction, context: NarrativeActionContext): string {
  const shooter = name(context.attackerName, "The archer");
  const target = name(context.targetName, "the enemy");
  const weapon = context.weaponName ?? "shot";

  if (action.hit === false) {
    return `${shooter}'s ${weapon} whistles past ${target}${joinCauses(context)}.`;
  }
  if (action.suppressed) {
    return `${shooter} pins ${target} down in a storm of fire.`;
  }
  return `${shooter}'s ${weapon} finds ${target}${action.region ? `'s ${action.region}` : ""}, shifting the momentum of the fight.`;
}

export function describeAction(
  action: CombatAction,
  context: NarrativeActionContext = {},
  options: DescribeActionOptions = {},
): string {
  const verbosity = options.verbosity ?? "tactical";

  if (action.kind === "morale") {
    return verbosity === "cinematic"
      ? `${name(context.attackerName, "The line")} falters as fear spreads${joinCauses(context)}.`
      : `${name(context.attackerName, "Unit")} suffers a morale break${joinCauses(context)}.`;
  }

  if (action.kind === "status") {
    return verbosity === "cinematic"
      ? `${name(context.attackerName, "The warrior")} staggers but refuses to fall.`
      : `${name(context.attackerName, "Entity")} status changed.`;
  }

  if (action.kind === "ranged") {
    return verbosity === "cinematic"
      ? cinematicRanged(action, context)
      : tacticalRanged(action, context);
  }

  return verbosity === "cinematic"
    ? cinematicMelee(action, context)
    : tacticalMelee(action, context);
}
