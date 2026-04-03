export interface NarrativeWeight {
  expectedWinnerId?: number;
  expectedWinnerTeamId?: number;
  heroIds?: number[];
  desiredBeat?: "heroic_near_win" | "clean_victory" | "tragic_loss" | "upset";
  dramaticTolerance?: number; // 0..1 (higher allows chaos)
}

export interface WorldPlausibilityState {
  winnerId?: number;
  winnerTeamId?: number;
  casualtiesByEntityId?: Record<number, boolean>;
  eliminationOrder?: number[];
  rareEventRolls?: Array<{ label: string; chance: number; happened: boolean }>;
}

export interface NarrativeViolation {
  code: "hero_fell_to_mook" | "unlikely_chain" | "expected_winner_lost";
  message: string;
  severity: "low" | "medium" | "high";
}

export interface PlausibilityReport {
  score: number;
  violations: NarrativeViolation[];
  suggestedSeeds: number[];
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function analyzePlausibility(
  worldState: WorldPlausibilityState,
  narrativeWeight: NarrativeWeight,
): PlausibilityReport {
  const violations: NarrativeViolation[] = [];
  let score = 100;

  const tolerance = narrativeWeight.dramaticTolerance ?? 0.25;
  const heroIds = narrativeWeight.heroIds ?? [];

  if (narrativeWeight.expectedWinnerTeamId !== undefined && worldState.winnerTeamId !== undefined) {
    if (narrativeWeight.expectedWinnerTeamId !== worldState.winnerTeamId) {
      score -= 28;
      violations.push({
        code: "expected_winner_lost",
        message: `Expected team ${narrativeWeight.expectedWinnerTeamId} to win, but team ${worldState.winnerTeamId} prevailed.`,
        severity: "high",
      });
    }
  }

  if (narrativeWeight.expectedWinnerId !== undefined && worldState.winnerId !== undefined) {
    if (narrativeWeight.expectedWinnerId !== worldState.winnerId) {
      score -= 22;
      violations.push({
        code: "expected_winner_lost",
        message: `Expected entity ${narrativeWeight.expectedWinnerId} to win, but entity ${worldState.winnerId} won.`,
        severity: "medium",
      });
    }
  }

  const deadHeroes = heroIds.filter(id => worldState.casualtiesByEntityId?.[id]);
  if (deadHeroes.length > 0 && (narrativeWeight.desiredBeat === "heroic_near_win" || narrativeWeight.desiredBeat === "clean_victory")) {
    score -= 35;
    violations.push({
      code: "hero_fell_to_mook",
      message: `Named hero(es) ${deadHeroes.join(", ")} died against the target beat.` ,
      severity: "high",
    });
  }

  const improbableWins = (worldState.rareEventRolls ?? []).filter(r => r.happened && r.chance <= 0.01);
  if (improbableWins.length > Math.max(0, Math.round(2 * tolerance))) {
    score -= 18;
    violations.push({
      code: "unlikely_chain",
      message: `Outcome relied on ${improbableWins.length} ultra-rare events (${improbableWins.map(r => r.label).join(", ")}).`,
      severity: "medium",
    });
  }

  if (narrativeWeight.desiredBeat === "heroic_near_win" && heroIds.length > 0) {
    const hero = heroIds[0]!;
    const eliminationOrder = worldState.eliminationOrder ?? [];
    const heroElimIndex = eliminationOrder.indexOf(hero);
    if (heroElimIndex !== -1) {
      score -= 30;
      violations.push({
        code: "hero_fell_to_mook",
        message: `Hero ${hero} was eliminated at position ${heroElimIndex + 1} during a near-win target beat.`,
        severity: "high",
      });
    }
  }

  const suggestedSeeds = buildSuggestedSeeds(score, narrativeWeight.desiredBeat);
  return { score: clampScore(score), violations, suggestedSeeds };
}

function buildSuggestedSeeds(score: number, beat: NarrativeWeight["desiredBeat"]): number[] {
  const base = beat === "heroic_near_win" ? 7300 : beat === "clean_victory" ? 4100 : 9100;
  const adjustment = Math.max(1, Math.trunc((100 - score) / 5));
  return [base + adjustment, base + adjustment + 17, base + adjustment + 49];
}

export function scorePlausibility(worldState: WorldPlausibilityState, narrativeWeight: NarrativeWeight): number {
  return analyzePlausibility(worldState, narrativeWeight).score;
}
