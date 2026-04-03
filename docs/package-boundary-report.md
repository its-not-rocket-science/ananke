# Package Boundary Report

Generated: 2026-04-03T00:49:11.307Z

## Summary

- Source files scanned: 216
- Files mapped to package: 203
- Unmapped files: 13
- Hard violations: 87
- Suspicious imports (warning mode): 60

## Cross-package import matrix

| From \ To | core | combat | campaign | content |
|---|---:|---:|---:|---:|
| core | self | 50 | 26 | 11 |
| combat | 214 | self | 15 | 7 |
| campaign | 154 | 18 | self | 5 |
| content | 60 | 13 | 14 | self |

## Hard violations

- `src/bridge/bridge-engine.ts:4` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:5` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:5` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:5` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/interpolation.ts:5` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/mapping.ts:4` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/bridge/types.ts:5` imports `../model3d.js` → `src/model3d.ts` (core → content).
- `src/derive.ts:3` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/derive.ts:3` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/generate.ts:22` imports `./archetypes.js` → `src/archetypes.ts` (core → content).
- `src/presets.ts:16` imports `./archetypes.js` → `src/archetypes.ts` (core → content).
- `src/presets.ts:17` imports `./equipment.js` → `src/equipment.ts` (core → combat).
- `src/presets.ts:21` imports `./sim/injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/body.ts:3` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/bodyplan.ts:10` imports `../channels.js` → `src/channels.ts` (core → campaign).
- `src/sim/bodyplan.ts:11` imports `../anatomy/anatomy-contracts.js` → `src/anatomy/anatomy-contracts.ts` (core → combat).
- `src/sim/capability.ts:11` imports `../channels.js` → `src/channels.ts` (core → campaign).
- `src/sim/capability.ts:12` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/capability.ts:13` imports `./substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/capability.ts:14` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/capability.ts:15` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/commands.ts:6` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/context.ts:4` imports `./density.js` → `src/sim/density.ts` (core → combat).
- `src/sim/context.ts:7` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/context.ts:8` imports `./weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/context.ts:10` imports `./biome.js` → `src/sim/biome.ts` (core → campaign).
- `src/sim/entity.ts:2` imports `../competence/willpower.js` → `src/competence/willpower.ts` (core → combat).
- `src/sim/entity.ts:3` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/entity.ts:5` imports `../species.js` → `src/species.ts` (core → content).
- `src/sim/entity.ts:9` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/entity.ts:14` imports `./substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/entity.ts:16` imports `./toxicology.js` → `src/sim/toxicology.ts` (core → campaign).
- `src/sim/entity.ts:19` imports `./systemic-toxicology.js` → `src/sim/systemic-toxicology.ts` (core → campaign).
- `src/sim/entity.ts:20` imports `./wound-aging.js` → `src/sim/wound-aging.ts` (core → combat).
- `src/sim/entity.ts:21` imports `./disease.js` → `src/sim/disease.ts` (core → campaign).
- `src/sim/entity.ts:22` imports `./aging.js` → `src/sim/aging.ts` (core → campaign).
- `src/sim/entity.ts:23` imports `./sleep.js` → `src/sim/sleep.ts` (core → campaign).
- `src/sim/entity.ts:24` imports `./mount.js` → `src/sim/mount.ts` (core → campaign).
- `src/sim/entity.ts:34` imports `../anatomy/anatomy-contracts.js` → `src/anatomy/anatomy-contracts.ts` (core → combat).
- `src/sim/entity.ts:35` imports `../anatomy/anatomy-helpers.js` → `src/anatomy/anatomy-helpers.ts` (core → combat).
- `src/sim/entity.ts:36` imports `../anatomy/anatomy-compiler.js` → `src/anatomy/anatomy-compiler.ts` (core → combat).
- `src/sim/events.ts:1` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/kernel.ts:8` imports `../channels.js` → `src/channels.ts` (core → campaign).
- `src/sim/kernel.ts:9` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/kernel.ts:11` imports `./tech.js` → `src/sim/tech.ts` (core → campaign).
- `src/sim/kernel.ts:12` imports `./impairment.js` → `src/sim/impairment.ts` (core → combat).
- `src/sim/kernel.ts:15` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/kernel.ts:20` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/kernel.ts:21` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/kernel.ts:22` imports `./explosion.js` → `src/sim/explosion.ts` (core → combat).
- `src/sim/kernel.ts:15` imports `./combat.js` → `src/sim/combat.ts` (core → combat).
- `src/sim/kernel.ts:31` imports `./formation.js` → `src/sim/formation.ts` (core → combat).
- `src/sim/kernel.ts:32` imports `./occlusion.js` → `src/sim/occlusion.ts` (core → combat).
- `src/sim/kernel.ts:33` imports `./frontage.js` → `src/sim/frontage.ts` (core → combat).
- `src/sim/kernel.ts:42` imports `./morale.js` → `src/sim/morale.ts` (core → combat).
- `src/sim/kernel.ts:49` imports `./knockback.js` → `src/sim/knockback.ts` (core → combat).
- `src/sim/kernel.ts:50` imports `./hydrostatic.js` → `src/sim/hydrostatic.ts` (core → combat).
- `src/sim/kernel.ts:51` imports `./cone.js` → `src/sim/cone.ts` (core → combat).
- `src/sim/kernel.ts:53` imports `./thermoregulation.js` → `src/sim/thermoregulation.ts` (core → campaign).
- `src/sim/kernel.ts:54` imports `./nutrition.js` → `src/sim/nutrition.ts` (core → campaign).
- `src/sim/kernel.ts:55` imports `./toxicology.js` → `src/sim/toxicology.ts` (core → campaign).
- `src/sim/kernel.ts:56` imports `./systemic-toxicology.js` → `src/sim/systemic-toxicology.ts` (core → campaign).
- `src/sim/kernel.ts:61` imports `./weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/kernel.ts:70` imports `./grapple.js` → `src/sim/grapple.ts` (core → combat).
- `src/sim/kernel.ts:79` imports `./weapon_dynamics.js` → `src/sim/weapon_dynamics.ts` (core → combat).
- `src/sim/kernel.ts:88` imports `./ranged.js` → `src/sim/ranged.ts` (core → combat).
- `src/sim/limb.ts:14` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/step/energy.ts:8` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/injury.ts:5` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/injury.ts:8` imports `../../channels.js` → `src/channels.ts` (core → campaign).
- `src/sim/step/injury.ts:10` imports `../injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/step/morale.ts:23` imports `../morale.js` → `src/sim/morale.ts` (core → combat).
- `src/sim/step/movement.ts:13` imports `../impairment.js` → `src/sim/impairment.ts` (core → combat).
- `src/sim/step/movement.ts:14` imports `../../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/step/phases/prepare-phase.ts:4` imports `../../density.js` → `src/sim/density.ts` (core → combat).
- `src/sim/step/phases/prepare-phase.ts:6` imports `../../weather.js` → `src/sim/weather.ts` (core → campaign).
- `src/sim/step/substances.ts:4` imports `../substance.js` → `src/sim/substance.ts` (core → campaign).
- `src/sim/team.ts:3` imports `../faction.js` → `src/faction.ts` (core → combat).
- `src/sim/team.ts:4` imports `../party.js` → `src/party.ts` (core → combat).
- `src/sim/testing.ts:2` imports `../archetypes.js` → `src/archetypes.ts` (core → content).
- `src/sim/testing.ts:6` imports `./injury.js` → `src/sim/injury.ts` (core → combat).
- `src/sim/testing.ts:7` imports `../equipment.js` → `src/equipment.ts` (core → combat).
- `src/sim/trace.ts:6` imports `./medical.js` → `src/sim/medical.ts` (core → combat).
- `src/sim/world.ts:4` imports `../faction.js` → `src/faction.ts` (core → combat).
- `src/sim/world.ts:5` imports `../party.js` → `src/party.ts` (core → combat).
- `src/sim/world.ts:6` imports `../relationships.js` → `src/relationships.ts` (core → campaign).
- `src/traits.ts:1` imports `./channels.js` → `src/channels.ts` (core → campaign).

## Suspicious imports (warning mode)

- `src/arena.ts:33` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/arena.ts:33` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/campaign-layer.ts:14` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/campaign.ts:12` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/campaign.ts:17` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/campaign.ts:17` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/catalog.ts:31` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/catalog.ts:32` imports `./channels.js` → `src/channels.ts` (content → campaign).
- `src/character.ts:12` imports `./sim/aging.js` → `src/sim/aging.ts` (content → campaign).
- `src/character.ts:13` imports `./sim/sleep.js` → `src/sim/sleep.ts` (content → campaign).
- `src/character.ts:14` imports `./sim/disease.js` → `src/sim/disease.ts` (content → campaign).
- `src/character.ts:15` imports `./sim/wound-aging.js` → `src/sim/wound-aging.ts` (content → combat).
- `src/character.ts:16` imports `./sim/thermoregulation.js` → `src/sim/thermoregulation.ts` (content → campaign).
- `src/character.ts:17` imports `./sim/nutrition.js` → `src/sim/nutrition.ts` (content → campaign).
- `src/character.ts:18` imports `./sim/medical.js` → `src/sim/medical.ts` (content → combat).
- `src/character.ts:19` imports `./sim/toxicology.js` → `src/sim/toxicology.ts` (content → campaign).
- `src/character.ts:20` imports `./progression.js` → `src/progression.ts` (content → campaign).
- `src/combat.ts:16` imports `./sim/mount.js` → `src/sim/mount.ts` (combat → campaign).
- `src/combat.ts:17` imports `./sim/hazard.js` → `src/sim/hazard.ts` (combat → campaign).
- `src/combat.ts:21` imports `./sim/weather.js` → `src/sim/weather.ts` (combat → campaign).
- `src/combat.ts:24` imports `./sim/biome.js` → `src/sim/biome.ts` (combat → campaign).
- `src/crafting/index.ts:12` imports `../equipment.js` → `src/equipment.ts` (content → combat).
- `src/crafting/materials.ts:8` imports `../equipment.js` → `src/equipment.ts` (content → combat).
- `src/dialogue.ts:15` imports `./narrative.js` → `src/narrative.ts` (combat → campaign).
- `src/downtime.ts:21` imports `./sim/thermoregulation.js` → `src/sim/thermoregulation.ts` (combat → campaign).
- `src/downtime.ts:22` imports `./sim/nutrition.js` → `src/sim/nutrition.ts` (combat → campaign).
- `src/downtime.ts:23` imports `./sim/toxicology.js` → `src/sim/toxicology.ts` (combat → campaign).
- `src/economy.ts:10` imports `./equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/economy.ts:11` imports `./downtime.js` → `src/downtime.ts` (campaign → combat).
- `src/equipment.ts:4` imports `./channels.js` → `src/channels.ts` (combat → campaign).
- `src/equipment.ts:4` imports `./channels.js` → `src/channels.ts` (combat → campaign).
- `src/equipment.ts:9` imports `./sim/tech.js` → `src/sim/tech.ts` (combat → campaign).
- `src/modding.ts:28` imports `./sim/ai/behavior-trees.js` → `src/sim/ai/behavior-trees.ts` (content → combat).
- `src/narrative-layer.ts:21` imports `./arena.js` → `src/arena.ts` (campaign → combat).
- `src/narrative.ts:8` imports `./equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/narrative.ts:9` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/party.ts:268` imports `./relationships.js` → `src/relationships.ts` (combat → campaign).
- `src/polity.ts:17` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/polity.ts:17` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/progression.ts:22` imports `./sim/injury.js` → `src/sim/injury.ts` (campaign → combat).
- `src/quest-generators.ts:11` imports `./competence/catalogue.js` → `src/competence/catalogue.ts` (campaign → combat).
- `src/quest.ts:7` imports `./competence/catalogue.js` → `src/competence/catalogue.ts` (campaign → combat).
- `src/sim/medical.ts:3` imports `./tech.js` → `src/sim/tech.ts` (combat → campaign).
- `src/sim/thermoregulation.ts:15` imports `../equipment.js` → `src/equipment.ts` (campaign → combat).
- `src/social.ts:12` imports `./dialogue.js` → `src/dialogue.ts` (campaign → combat).
- `src/social.ts:13` imports `./faction.js` → `src/faction.ts` (campaign → combat).
- `src/social.ts:16` imports `./party.js` → `src/party.ts` (campaign → combat).
- `src/species.ts:19` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:37` imports `./weapons.js` → `src/weapons.ts` (content → combat).
- `src/world-factory.ts:38` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:38` imports `./equipment.js` → `src/equipment.ts` (content → combat).
- `src/world-factory.ts:44` imports `./sim/injury.js` → `src/sim/injury.ts` (content → combat).
- `src/world-generation.ts:11` imports `./settlement.js` → `src/settlement.ts` (content → campaign).
- `src/world-generation.ts:11` imports `./settlement.js` → `src/settlement.ts` (content → campaign).
- `src/world-generation.ts:13` imports `./faction.js` → `src/faction.ts` (content → combat).
- `src/world-generation.ts:13` imports `./faction.js` → `src/faction.ts` (content → combat).
- `src/world-generation.ts:15` imports `./relationships.js` → `src/relationships.ts` (content → campaign).
- `src/world-generation.ts:15` imports `./relationships.js` → `src/relationships.ts` (content → campaign).
- `src/world-generation.ts:17` imports `./chronicle.js` → `src/chronicle.ts` (content → campaign).
- `src/world-generation.ts:17` imports `./chronicle.js` → `src/chronicle.ts` (content → campaign).

## Unmapped files

- `src/atmosphere.ts`
- `src/battle-bridge.ts`
- `src/conformance.ts`
- `src/debug.ts`
- `src/host-loop.ts`
- `src/index.ts`
- `src/parallel.ts`
- `src/sim/normalization.ts`
- `src/sim/sensory-extended.ts`
- `src/sim/sensory.ts`
- `src/terrain-bridge.ts`
- `src/tier2.ts`
- `src/tier3.ts`
