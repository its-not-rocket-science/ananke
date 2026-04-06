module.exports = {
  setup(api) {
    const frames = [];

    return {
      afterStep(context) {
        const world = api.readWorldState(context.worldState);
        const entities = Array.isArray(world.entities) ? world.entities : [];

        const frame = {
          tick: context.tick ?? 0,
          entities: entities.map(entity => ({
            id: entity.id,
            x: entity.pos?.x ?? 0,
            y: entity.pos?.y ?? 0,
            hp: entity.hp ?? 0,
          })),
        };

        frames.push(frame);
        context.render?.(frame);
        api.emitTelemetry("visualizer.frame", { tick: frame.tick, entities: frame.entities.length });
      },
    };
  },
};
