module.exports = {
  setup(api) {
    let firstBlood = null;

    return {
      afterDamage(context) {
        if (!firstBlood && context.killed) {
          firstBlood = {
            achievement: "first_blood",
            killerId: context.attackerId,
            victimId: context.targetId,
            tick: context.tick,
          };
          api.emitTelemetry("achievement.first_blood", firstBlood);
        }
      },
      matchEnd(context) {
        const achievements = [];
        if (firstBlood) achievements.push(firstBlood);

        if (context.winnerTeamId && Array.isArray(context.teamDamageTaken)) {
          const winnerDamage = context.teamDamageTaken.find(entry => entry.teamId === context.winnerTeamId);
          if (winnerDamage && winnerDamage.totalDamage === 0) {
            achievements.push({
              achievement: "flawless_victory",
              teamId: context.winnerTeamId,
            });
          }
        }

        api.writeArtifact("achievements.json", JSON.stringify(achievements, null, 2));
      },
    };
  },
};
