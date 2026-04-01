# API Surface: @ananke/content

> **Auto-generated** by `tools/extract-api.ts` — 2026-03-31  
> Do not edit by hand. Re-run `npm run extract-api` to refresh.

**Species, equipment catalogue, archetypes, crafting**

Total exported symbols: **103**

---

## Source files (8)

- `src/archetypes.ts` — 8 exports
- `src/catalog.ts` — 9 exports
- `src/content-pack.ts` — 10 exports
- `src/crafting/index.ts` — 6 exports
- `src/inventory.ts` — 37 exports
- `src/scenario.ts` — 4 exports
- `src/species.ts` — 23 exports
- `src/world-generation.ts` — 6 exports

---

## Types & Interfaces (22)

| Name | Source | Notes |
|------|--------|-------|
| `AnankePackManifest` | `src/content-pack.ts` | The `.ananke-pack` manifest schema. All numeric fields in `weapons`, `armour`, and `archetypes` use real-world SI units (kg, m, J, s) and Q ratios in [0, 1].  See `docs/wire-protocol.md` for the full serialisation contract. |
| `AnankeScenario` | `src/scenario.ts` |  |
| `AnankeScenarioEntity` | `src/scenario.ts` |  |
| `Archetype` | `src/archetypes.ts` |  |
| `CatalogEntry` | `src/catalog.ts` |  |
| `CatalogKind` | `src/catalog.ts` |  |
| `Container` | `src/inventory.ts` | A container (bag, pouch, backpack) that holds items. |
| `EncumbranceCategory` | `src/inventory.ts` |  |
| `EncumbranceCategoryDef` | `src/inventory.ts` |  |
| `EquippedItems` | `src/inventory.ts` | A record of equipped items by slot. |
| `GeneratedWorld` | `src/world-generation.ts` |  |
| `Inventory` | `src/inventory.ts` | Complete inventory for an entity. |
| `InventoryEncumbrancePenalties` | `src/inventory.ts` |  |
| `ItemInstance` | `src/inventory.ts` | An instance of an item in the inventory. |
| `ItemMod` | `src/inventory.ts` | Item modification types. |
| `LoadPackResult` | `src/content-pack.ts` | Result of a `loadPack` call. |
| `PackValidationError` | `src/content-pack.ts` | A single actionable validation failure from `validatePack`. |
| `SpeciesDefinition` | `src/species.ts` | Declarative species record. |
| `SpeciesEntitySpec` | `src/species.ts` | Everything `generateSpeciesIndividual` returns — the caller uses this to assemble a full Entity (set attributes, physiology, bodyPlan, apply traits, attach capabilities, add natural weapons to loadout). |
| `SpeciesPhysiology` | `src/species.ts` | Runtime metabolic overrides attached to Entity.physiology (Phase 31). |
| `WorldGenConfig` | `src/world-generation.ts` |  |
| `WorldInhabitant` | `src/world-generation.ts` |  |

## Functions (53)

| Name | Source | Notes |
|------|--------|-------|
| `addContainer` | `src/inventory.ts` | Add a container to inventory. |
| `addItemToContainer` | `src/inventory.ts` | Add an item to a specific container. |
| `addItemToInventory` | `src/inventory.ts` | Add an item to inventory, attempting to place it in a suitable container. Prefers equipped containers with sufficient capacity. Returns success and the container it was added to (or null if equipped). |
| `advanceManufacturing` | `src/crafting/index.ts` | Advance manufacturing for a production line. Returns items completed in this step. |
| `applyItemMod` | `src/inventory.ts` | Apply a modification to an item. |
| `applyMaterialProperties` | `src/crafting/index.ts` | Get material properties for a crafted item. Applies material property modifiers to base item stats. |
| `calculateContainerWeight` | `src/inventory.ts` | Calculate total weight of items in a container (including container itself). |
| `calculateMaxEncumbrance_Kg` | `src/inventory.ts` | Calculate maximum encumbrance based on physical strength. Stronger characters can carry more absolute weight. |
| `calculateTotalEncumbrance` | `src/inventory.ts` | Calculate total encumbrance for an inventory. |
| `clearCatalog` | `src/catalog.ts` | Remove all registered entries.  Useful for resetting state in tests. |
| `clearPackRegistry` | `src/content-pack.ts` | Remove all entries from the pack registry. Does NOT un-register catalog entries — call `clearCatalog()` separately if needed. Primarily for testing. |
| `consumeItemsByTemplateId` | `src/inventory.ts` | Consume items by template ID, removing them from inventory. Returns true if enough items were found and consumed. |
| `craftItem` | `src/crafting/index.ts` | Craft a single item using a recipe, entity, inventory, and workshop. Returns resolution result with success, quality, time, and consumed ingredients. |
| `createContainer` | `src/inventory.ts` | Create a new container. |
| `createInventory` | `src/inventory.ts` | Create an empty inventory for an entity. |
| `deserializeInventory` | `src/inventory.ts` | Deserialize inventory. |
| `equipItem` | `src/inventory.ts` | Equip an item from a container to an equipment slot. |
| `findContainer` | `src/inventory.ts` | Find a container by ID. |
| `findItem` | `src/inventory.ts` | Find an item anywhere in the inventory. |
| `findMaterialsByType` | `src/inventory.ts` | Find all material items of a specific material type. Returns an array of Material items (requires kind "material" and materialTypeId). Note: This assumes ItemInstance can be cast to Material if kind === "material". The caller must ensure the item is a material. |
| `generateSpeciesIndividual` | `src/species.ts` | Generate an individual from a species definition using a deterministic seed. Applies innate traits via `applyTraitsToAttributes` (which deep-copies attrs). |
| `generateWorld` | `src/world-generation.ts` |  |
| `getAvailableRecipes` | `src/crafting/index.ts` | Get all recipes that can be crafted by an entity with given inventory and workshop. Returns filtered list of recipes. |
| `getCatalogEntry` | `src/catalog.ts` | Look up a registered entry by id. Returns the CatalogEntry or undefined if not found. |
| `getEffectiveEncumbrancePenalties` | `src/inventory.ts` | Get effective encumbrance penalties (combines with any existing penalties). |
| `getEncumbranceCategory` | `src/inventory.ts` | Get the encumbrance category and penalties for current load. |
| `getItemCountByTemplateId` | `src/inventory.ts` | Count items in inventory by template ID. Searches all containers and equipped items. |
| `getItemInstanceMass` | `src/inventory.ts` | Get mass of a single item instance (including modifications). |
| `getItemStatMultiplier` | `src/inventory.ts` | Get effective stat multiplier from all modifications. |
| `getLoadedPack` | `src/content-pack.ts` | Returns the pack registry entry for a previously-loaded pack, or `undefined`. |
| `getPackScenario` | `src/content-pack.ts` | Returns the raw scenario JSON stored in a pack. @param packId    — `"name@version"` as returned by `loadPack`. @param scenarioId — the scenario's `id` field. |
| `getWorldSummary` | `src/world-generation.ts` |  |
| `instantiatePackScenario` | `src/content-pack.ts` | Instantiate a packed scenario into a live `WorldState`. Equivalent to `loadScenario(getPackScenario(packId, scenarioId))`. Throws if the pack or scenario does not exist. |
| `integrateCraftingIntoInventory` | `src/crafting/index.ts` | Integrate crafting result into inventory. Consumes ingredients and adds crafted item. Returns success and error if any. |
| `listCatalog` | `src/catalog.ts` | Return all registered ids of the given kind, or all ids when kind is omitted. |
| `listLoadedPacks` | `src/content-pack.ts` | Returns the `"name@version"` ids of all currently loaded packs. |
| `loadPack` | `src/content-pack.ts` | Validate and load a pack manifest into the active catalogues. - Weapons, armour, and archetypes are registered into the global catalog. - Scenarios are stored in the pack registry; retrieve with `getPackScenario`. - If `validatePack` reports errors the pack is NOT loaded and `errors` is populated in the result. - Loading a pack with the same `name@version` id a second time is a no-op (returns the original result with `errors` empty). |
| `loadScenario` | `src/scenario.ts` | Parse and load a scenario from JSON, returning a WorldState ready for stepWorld(). Calls validateScenario first — throws an Error with all validation messages if invalid. Maps AnankeScenarioEntity.id as the entity seed. |
| `moveItem` | `src/inventory.ts` | Move an item between containers. |
| `recalculateEncumbrance` | `src/inventory.ts` | Recalculate encumbrance and update inventory. |
| `registerArchetype` | `src/catalog.ts` | Parse a JSON archetype definition and register it in the catalog. @param json - Raw JSON value (e.g. from JSON.parse).  Must have: - `id` (string): unique catalog identifier - `base` (string, optional): name of a built-in archetype to inherit from - `overrides` (object, optional): field values to override in real SI units @returns The converted Archetype object. @throws If required fields are missing, values are out of range, or `id` already registered. |
| `registerArmour` | `src/catalog.ts` | Parse a JSON armour definition and register it in the catalog. @param json - Raw JSON value. Required fields: - `id`, `name` (string) - `mass_kg` (real kg), `bulk` (Q 0..1) - `resist_J` (real Joules), `protectedDamageMul` (Q 0..1) - `coverageByRegion` (object mapping region name → Q 0..1) @returns The converted Armour object. @throws If required fields are missing or `id` already registered. |
| `registerWeapon` | `src/catalog.ts` | Parse a JSON weapon definition and register it in the catalog. @param json - Raw JSON value. Required fields: - `id`, `name` (string) - `mass_kg` (real kg), `bulk` (Q 0..1) - `damage` (object with surfaceFrac, internalFrac, structuralFrac, bleedFactor, penetrationBias) @returns The converted Weapon object. @throws If required fields are missing or `id` already registered. |
| `removeContainer` | `src/inventory.ts` | Remove a container from inventory. |
| `removeItemFromContainer` | `src/inventory.ts` | Remove an item from a container by instance ID. |
| `removeItemMod` | `src/inventory.ts` | Remove a modification from an item. |
| `serializeInventory` | `src/inventory.ts` | Serialize inventory to JSON-friendly format. |
| `setContainerEquipped` | `src/inventory.ts` | Equip/unequip a container. |
| `startManufacturing` | `src/crafting/index.ts` | Start batch manufacturing of items. Creates a production line and returns its ID. |
| `unequipItem` | `src/inventory.ts` | Unequip an item and return it to a container. |
| `unregisterCatalogEntry` | `src/catalog.ts` | Remove a registered entry.  Useful in tests. Returns true if the entry existed and was removed. |
| `validatePack` | `src/content-pack.ts` | Validate a pack manifest for structural conformance without loading it. Checks required top-level fields, array element shapes, and runs `validateScenario` on each scenario entry. @returns Array of `PackValidationError`.  Empty means valid. |
| `validateScenario` | `src/scenario.ts` | Validate structural correctness of a JSON scenario object. Returns an array of error strings — empty array means valid. Does NOT perform simulation-level lookups (e.g. archetype/weapon existence). |

## Constants (28)

| Name | Source | Notes |
|------|--------|-------|
| `ALL_SPECIES` | `src/species.ts` |  |
| `AMATEUR_BOXER` | `src/archetypes.ts` | Amateur boxer — British Journal of Sports Medicine, Walilko et al. Amateur punch force: 2,500–4,000 N (nominal 2,800 N used). |
| `CENTAUR_SPECIES` | `src/species.ts` | Centaur — horse body with human torso; CENTAUR_PLAN anatomy. |
| `DEFAULT_WORLDGEN_CONFIG` | `src/world-generation.ts` |  |
| `DRAGON_SPECIES` | `src/species.ts` | Dragon — immense fire-breathing reptilian with scales and flight capability. |
| `DWARF_SPECIES` | `src/species.ts` | Dwarf — stocky, dense-boned, underground-adapted. |
| `ELF_SPECIES` | `src/species.ts` | Elf — graceful, keen-sensed, sylvan endurance. |
| `ENCUMBRANCE_CATEGORIES` | `src/inventory.ts` |  |
| `FANTASY_HUMANOID_SPECIES` | `src/species.ts` |  |
| `FICTIONAL_SPECIES` | `src/species.ts` |  |
| `GOBLIN_SPECIES` | `src/species.ts` | Goblin — small, cowardly, extremely fast reactions. |
| `GRECO_WRESTLER` | `src/archetypes.ts` | Greco-Roman wrestler — Olympic grappling literature. Grip ~500 N forearm; whole-body throw ~2,000 N. |
| `HALFLING_SPECIES` | `src/species.ts` | Halfling — small, nimble, with surprising resilience. |
| `HEECHEE_SPECIES` | `src/species.ts` | Heechee — Fred Pohl's Gateway aliens. Thin, soft-bodied, technologically advanced; fragile but extraordinarily precise. |
| `HUMAN_BASE` | `src/archetypes.ts` |  |
| `KLINGON_SPECIES` | `src/species.ts` | Klingon — aggressive warrior with redundant organs and thick cranial ridges. |
| `KNIGHT_INFANTRY` | `src/archetypes.ts` | Medieval knight infantry — trained warrior; armour applied via preset loadout. |
| `LARGE_PACIFIC_OCTOPUS` | `src/archetypes.ts` | Large Pacific Octopus (Enteroctopus dofleini). Arm muscle force ~150 N × 8 arms ≈ 1,200 N total burst. ~2,000 suckers → extremely high controlQuality + grappling skill in presets. Distributed nervous system → high concussionTolerance, low structureIntegrity (no skeleton). |
| `MYTHOLOGICAL_SPECIES` | `src/species.ts` |  |
| `OGRE_SPECIES` | `src/species.ts` | Ogre — massive, brutish, very slow decision-making. |
| `ORC_SPECIES` | `src/species.ts` | Orc — powerful, pain-ignorant, high metabolic rate. |
| `PRO_BOXER` | `src/archetypes.ts` | Pro boxer — biomechanics studies on elite boxers. Elite punch force: 4,000–7,000 N (nominal 5,000 N, cruiserweight/light-heavy). |
| `ROMULAN_SPECIES` | `src/species.ts` | Romulan — disciplined but more emotionally variable than Vulcans. |
| `SATYR_SPECIES` | `src/species.ts` | Satyr — goat-human hybrid with natural horn and extraordinary balance. |
| `SCIFI_HUMANOID_SPECIES` | `src/species.ts` |  |
| `SERVICE_ROBOT` | `src/archetypes.ts` |  |
| `TROLL_SPECIES` | `src/species.ts` | Troll — massive regenerator, devastatingly vulnerable to fire. |
| `VULCAN_SPECIES` | `src/species.ts` | Vulcan — disciplined, strong, meditative metabolism; very low individual variance. |

