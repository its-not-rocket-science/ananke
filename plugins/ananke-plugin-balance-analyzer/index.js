module.exports = {
  setup(api) {
    const totals = new Map();

    return {
      matchEnd(context) {
        const summary = Array.isArray(context.summary) ? context.summary : [];
        for (const row of summary) {
          const key = row.unitType;
          if (!totals.has(key)) totals.set(key, { wins: 0, matches: 0 });
          const slot = totals.get(key);
          slot.matches += 1;
          if (row.didWin) slot.wins += 1;
        }

        const report = [...totals.entries()].map(([unitType, value]) => ({
          unitType,
          wins: value.wins,
          matches: value.matches,
          winRate: value.matches === 0 ? 0 : value.wins / value.matches,
        }));

        api.writeArtifact("win-rates.json", JSON.stringify(report, null, 2));
        api.emitTelemetry("balance.report", { units: report.length });
      },
    };
  },
};
