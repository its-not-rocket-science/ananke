module.exports = {
  setup(api) {
    const rows = [];

    return {
      beforeStep(context) {
        rows.push({ hook: "beforeStep", tick: context.tick ?? -1, timestamp: Date.now() });
      },
      afterDamage(context) {
        rows.push({ hook: "afterDamage", amount: context.amount ?? 0, target: context.targetId ?? "unknown" });
      },
      afterStep(context) {
        rows.push({ hook: "afterStep", tick: context.tick ?? -1, entities: context.worldState?.entities?.length ?? 0 });
        const json = JSON.stringify(rows, null, 2);
        const csv = ["hook,tick,amount,target,entities,timestamp", ...rows.map(r => `${r.hook},${r.tick ?? ""},${r.amount ?? ""},${r.target ?? ""},${r.entities ?? ""},${r.timestamp ?? ""}`)].join("\n");
        api.writeArtifact("logs.json", json);
        api.writeArtifact("logs.csv", csv);
        api.emitTelemetry("logger.flush", { rowCount: rows.length });
      },
    };
  },
};
