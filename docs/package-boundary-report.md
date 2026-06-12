# Package Boundary Report

Generated: 2026-04-09T13:03:18.848Z

## Summary

- Source files scanned: 243
- Files mapped to package: 207
- Unmapped files: 36
- Unresolved relative imports: 0
- Hard violations: 84
- Suspicious imports (warning mode): 60

## Cross-package import matrix

| From \ To | core | combat | campaign | content |
|---|---:|---:|---:|---:|
| core | self | 52 | 21 | 11 |
| combat | 216 | self | 16 | 7 |
| campaign | 154 | 18 | self | 5 |
| content | 62 | 13 | 13 | self |

## Hard violations

- `src/bridge/bridge-engine.ts:4:34` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:5:35` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:117:16` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:118:16` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:120:11` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/mapping.ts:4:35` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/types.ts:5:74` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/derive.ts:3:30` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/derive.ts:4:95` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/generate.ts:22:32` imports `./archetypes.js` → `src/archetypes.ts` (core → content).
- `src/presets.ts:16:8` imports `./archetypes.js` → `src/archetypes.ts` (core → content).
- `src/presets.ts:17:49` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/presets.ts:21:31` imports `./sim/injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/body.ts:3:30` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/bodyplan.ts:11:40` imports `../anatomy/anatomy-contracts.js` → `src/anatomy/anatomy-contracts.ts` (core → combat).
- `src/sim/capability.ts:12:34` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/capability.ts:13:38` imports `./substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/capability.ts:14:37` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/capability.ts:15:42` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/commands.ts:6:49` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/context.ts:4:35` imports `./density.js` → `src/sim/density.ts` (core → combat).
- `src/sim/context.ts:7:34` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/context.ts:8:35` imports `./weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/context.ts:10:35` imports `./biome.js` → `src/sim/biome.ts` (core → campaign).
- `src/sim/entity.ts:2:37` imports `../competence/willpower.js` → `src/competence/willpower.ts` (core → combat).
- `src/sim/entity.ts:3:30` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/entity.ts:5:40` imports `../species.js` → `src/species.ts` (core → content).
- `src/sim/entity.ts:9:34` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/entity.ts:14:38` imports `./substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/entity.ts:16:34` imports `./toxicology.js` → `src/sim/toxicology.ts` (core → campaign).
- `src/sim/entity.ts:19:85` imports `./systemic-toxicology.js` → `src/sim/systemic-toxicology.ts` (core → campaign).
- `src/sim/entity.ts:20:34` imports `./wound-aging.js` → `src/sim/wound-aging.ts` (core → combat).
- `src/sim/entity.ts:21:70` imports `./disease.js` → `src/sim/disease.ts` (core → campaign).
- `src/sim/entity.ts:22:31` imports `./aging.js` → `src/sim/aging.ts` (core → campaign).
- `src/sim/entity.ts:23:33` imports `./sleep.js` → `src/sim/sleep.ts` (core → campaign).
- `src/sim/entity.ts:24:33` imports `./mount.js` → `src/sim/mount.ts` (core → campaign).
- `src/sim/entity.ts:34:38` imports `../anatomy/anatomy-contracts.js` → `src/anatomy/anatomy-contracts.ts` (core → combat).
- `src/sim/entity.ts:35:61` imports `../anatomy/anatomy-helpers.js` → `src/anatomy/anatomy-helpers.ts` (core → combat).
- `src/sim/entity.ts:36:42` imports `../anatomy/anatomy-compiler.js` → `src/anatomy/anatomy-compiler.ts` (core → combat).
- `src/sim/events.ts:1:29` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/kernel.ts:9:134` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/kernel.ts:11:39` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/kernel.ts:12:39` imports `./impairment.js` → `src/sim/impairment.ts` (core → combat).
- `src/sim/kernel.ts:15:68` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/kernel.ts:20:36` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/kernel.ts:21:69` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/kernel.ts:22:92` imports `./explosion.js` → `src/sim/explosion.ts` (core → combat).
- `src/sim/kernel.ts:29:32` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/kernel.ts:31:41` imports `./formation.js` → `src/sim/formation.ts` (core → combat).
- `src/sim/kernel.ts:32:47` imports `./occlusion.js` → `src/sim/occlusion.ts` (core → combat).
- `src/sim/kernel.ts:33:34` imports `./frontage.js` → `src/sim/frontage.ts` (core → combat).
- `src/sim/kernel.ts:43:60` imports `./morale.js` → `src/sim/morale.ts` (core → combat).
- `src/sim/kernel.ts:52:45` imports `./cone.js` → `src/sim/cone.ts` (core → combat).
- `src/sim/kernel.ts:54:71` imports `./thermoregulation.js` → `src/sim/thermoregulation.ts` (core → campaign).
- `src/sim/kernel.ts:55:31` imports `./nutrition.js` → `src/sim/nutrition.ts` (core → campaign).
- `src/sim/kernel.ts:56:32` imports `./toxicology.js` → `src/sim/toxicology.ts` (core → campaign).
- `src/sim/kernel.ts:57:40` imports `./systemic-toxicology.js` → `src/sim/systemic-toxicology.ts` (core → campaign).
- `src/sim/kernel.ts:62:37` imports `./weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/kernel.ts:71:8` imports `./grapple.js` → `src/sim/grapple.ts` (core → combat).
- `src/sim/kernel.ts:80:8` imports `./weapon_dynamics.js` → `src/sim/weapon_dynamics.ts` (core → combat).
- `src/sim/kernel.ts:89:8` imports `./ranged.js` → `src/sim/ranged.ts` (core → combat).
- `src/sim/limb.ts:14:34` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/step/apply/intents.ts:2:64` imports `../../impairment.js` → `src/sim/impairment.ts` (core → combat).
- `src/sim/step/energy.ts:8:33` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/injury.ts:5:37` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/injury.ts:10:51` imports `../injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/step/morale.ts:23:8` imports `../morale.js` → `src/sim/morale.ts` (core → combat).
- `src/sim/step/movement.ts:13:39` imports `../impairment.js` → `src/sim/impairment.ts` (core → combat).
- `src/sim/step/movement.ts:14:33` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/phases/prepare-phase.ts:4:37` imports `../../density.js` → `src/sim/density.ts` (core → combat).
- `src/sim/step/phases/prepare-phase.ts:6:40` imports `../../weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/step/resolvers/impact-resolver.ts:1:50` imports `../../knockback.js` → `src/sim/knockback.ts` (core → combat).
- `src/sim/step/resolvers/impact-resolver.ts:2:67` imports `../../hydrostatic.js` → `src/sim/hydrostatic.ts` (core → combat).
- `src/sim/step/resolvers/impact-resolver.ts:8:29` imports `../../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/substances.ts:4:34` imports `../substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/team.ts:3:92` imports `../faction.js` → `src/faction.ts` (core → combat).
- `src/sim/team.ts:4:71` imports `../party.js` → `src/party.ts` (core → combat).
- `src/sim/testing.ts:2:28` imports `../archetypes.js` → `src/archetypes.ts` (core → content).
- `src/sim/testing.ts:6:31` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/testing.ts:7:38` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/trace.ts:6:36` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/world.ts:4:33` imports `../faction.js` → `src/faction.ts` (core → combat).
- `src/sim/world.ts:5:31` imports `../party.js` → `src/party.ts` (core → combat).
- `src/sim/world.ts:6:35` imports `../relationships.js` → `src/relationships.ts` (core → campaign).

## Suspicious imports (warning mode)

- `src/arena.ts:33:38` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/arena.ts:34:32` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/campaign-layer.ts:14:15` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/campaign.ts:12:34` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/campaign.ts:17:8` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/campaign.ts:18:30` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/catalog.ts:31:58` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/character.ts:12:15` imports `./sim/aging.js` → `src/sim/aging.ts` (content → campaign).
- `src/character.ts:13:15` imports `./sim/sleep.js` → `src/sim/sleep.ts` (content → campaign).
- `src/character.ts:14:15` imports `./sim/disease.js` → `src/sim/disease.ts` (content → campaign).
- `src/character.ts:15:15` imports `./sim/wound-aging.js` → `src/sim/wound-aging.ts` (content → combat).
- `src/character.ts:16:15` imports `./sim/thermoregulation.js` → `src/sim/thermoregulation.ts` (content → campaign).
- `src/character.ts:17:15` imports `./sim/nutrition.js` → `src/sim/nutrition.ts` (content → campaign).
- `src/character.ts:18:15` imports `./sim/medical.js` → `src/sim/medical.ts` (content → combat).
- `src/character.ts:19:15` imports `./sim/toxicology.js` → `src/sim/toxicology.ts` (content → campaign).
- `src/character.ts:20:15` imports `./progression.js` → `src/progression.ts` (content → campaign).
- `src/combat.ts:16:15` imports `./sim/mount.js` → `src/sim/mount.ts` (combat → campaign).
- `src/combat.ts:17:15` imports `./sim/hazard.js` → `src/sim/hazard.ts` (combat → campaign).
- `src/combat.ts:21:15` imports `./sim/weather.js` → `src/sim/weather.ts` (combat → campaign).
- `src/combat.ts:24:15` imports `./sim/biome.js` → `src/sim/biome.ts` (combat → campaign).
- `src/crafting/index.ts:12:31` imports `../equipment.js` → `src/equipment.ts` (content → combat).
- `src/crafting/materials.ts:8:31` imports `../equipment.js` → `src/equipment.ts` (content → combat).
- `src/dialogue.ts:15:38` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/dialogue.ts:18:63` imports `./relationships.js` → `src/relationships.ts` (combat → campaign).
- `src/dialogue.ts:19:41` imports `./relationships.js` → `src/relationships.ts` (combat → campaign).
- `src/dialogue.ts:20:36` imports `./campaign.js` → `src/campaign.ts` (combat → campaign).
- `src/downtime.ts:21:8` imports `./sim/thermoregulation.js` → `src/sim/thermoregulation.ts` (combat → campaign).
- `src/downtime.ts:22:31` imports `./sim/nutrition.js` → `src/sim/nutrition.ts` (combat → campaign).
- `src/downtime.ts:23:32` imports `./sim/toxicology.js` → `src/sim/toxicology.ts` (combat → campaign).
- `src/economy.ts:10:57` imports `./equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/economy.ts:11:42` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/equipment.ts:9:50` imports `./sim/tech.js` → `src/sim/tech.ts` (combat → campaign).
- `src/modding.ts:28:35` imports `./sim/ai/behavior-trees.js` → `src/sim/ai/behavior-trees.ts` (content → combat).
- `src/narrative-layer.ts:21:15` imports `./arena.js` → `src/arena.ts` (campaign → combat).
- `src/narrative.ts:8:42` imports `./equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/narrative.ts:9:34` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/party.ts:268:30` imports `./relationships.js` → `src/relationships.ts` (combat → campaign).
- `src/polity.ts:17:38` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/polity.ts:18:38` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/progression.ts:22:35` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/quest-generators.ts:11:39` imports `./competence/catalogue.js` → `src/competence/catalogue.ts` (campaign → combat).
- `src/quest.ts:7:39` imports `./competence/catalogue.js` → `src/competence/catalogue.ts` (campaign → combat).
- `src/sim/medical.ts:3:37` imports `./tech.js` → `src/sim/tech.ts` (combat → campaign).
- `src/sim/thermoregulation.ts:15:22` imports `../equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/social.ts:12:15` imports `./dialogue.js` → `src/dialogue.ts` (campaign → combat).
- `src/social.ts:13:15` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/social.ts:16:15` imports `./party.js` → `src/party.ts` (campaign → combat).
- `src/species.ts:19:43` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:37:61` imports `./weapons.js` → `src/weapons.ts` (content → combat).
- `src/world-factory.ts:38:69` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:39:27` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:44:31` imports `./sim/injury.js` → `src/sim/injury.ts` (content → combat).
- `src/world-generation.ts:11:33` imports `./settlement.js` → `src/settlement.ts` (content → campaign).
- `src/world-generation.ts:12:57` imports `./settlement.js` → `src/settlement.ts` (content → campaign).
- `src/world-generation.ts:13:47` imports `./faction.js` → `src/faction.ts` (content → combat).
- `src/world-generation.ts:14:57` imports `./faction.js` → `src/faction.ts` (content → combat).
- `src/world-generation.ts:15:40` imports `./relationships.js` → `src/relationships.ts` (content → campaign).
- `src/world-generation.ts:16:39` imports `./relationships.js` → `src/relationships.ts` (content → campaign).
- `src/world-generation.ts:17:40` imports `./chronicle.js` → `src/chronicle.ts` (content → campaign).
- `src/world-generation.ts:18:60` imports `./chronicle.js` → `src/chronicle.ts` (content → campaign).

## Unresolved relative imports

None.

## Unmapped files

- `src/atmosphere.ts`
- `src/battle-bridge.ts`
- `src/conformance.ts`
- `src/content/index.ts`
- `src/content/injector.ts`
- `src/content/loader.ts`
- `src/content/types.ts`
- `src/content/validator.ts`
- `src/debug.ts`
- `src/determinism.ts`
- `src/history/autosave.ts`
- `src/history/timetravel.ts`
- `src/host-loop.ts`
- `src/index.ts`
- `src/narrative/combat-logger.ts`
- `src/narrative/plausibility.ts`
- `src/navigation/causal-chain.ts`
- `src/parallel.ts`
- `src/performance/adaptive-tick.ts`
- `src/plugins/loader.ts`
- `src/plugins/registry.ts`
- `src/plugins/types.ts`
- `src/serialization/binary.ts`
- `src/sim/normalization.ts`
- `src/sim/resolvers/attack-resolver.ts`
- `src/sim/resolvers/capability-resolver.ts`
- `src/sim/resolvers/grapple-resolver.ts`
- `src/sim/resolvers/shoot-resolver.ts`
- `src/sim/resolvers/treat-resolver.ts`
- `src/sim/sensory-extended.ts`
- `src/sim/sensory.ts`
- `src/terrain-bridge.ts`
- `src/tier2.ts`
- `src/tier3.ts`
- `src/version.ts`
- `src/wasm/bridge.ts`
