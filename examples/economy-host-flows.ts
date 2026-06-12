// examples/economy-host-flows.ts
//
// Product-facing host patterns for the economy subsystem:
// 1) post-battle loot screens
// 2) repair/reuse loops
// 3) settlement/shop interactions

import { STARTER_WEAPONS, STARTER_ARMOUR } from "../src/equipment.js";
import { q } from "../src/units.js";
import {
  computeItemValue,
  evaluateTradeOfferDetailed,
  examplePostBattleLootFlow,
  exampleRepairReuseLoop,
  mergeIntoInventory,
  type ItemInventory,
  type TradeOffer,
} from "../src/economy.js";
import { mkHumanoidEntity } from "../src/sim/testing.js";

const catalogue = new Map(
  [...STARTER_WEAPONS, ...STARTER_ARMOUR].map((item) => {
    const iv = computeItemValue(item);
    return [item.id, iv.baseValue] as const;
  }),
);

const resolveUnitValue = (itemId: string): number => catalogue.get(itemId) ?? 1;

// 1) Post-battle loot screen
const defeated = mkHumanoidEntity(2, 2, 0, 0);
defeated.injury.dead = true;
defeated.loadout = { items: [STARTER_WEAPONS[1]!, STARTER_ARMOUR[0]!] };

const lootReport = examplePostBattleLootFlow(defeated, 12345, resolveUnitValue);
console.log("post-battle loot", lootReport);

// 2) Repair / reuse loop for a worn longsword
const repairReport = exampleRepairReuseLoop(STARTER_WEAPONS[1]!, q(0.65), q(0.12));
console.log("repair/reuse", repairReport);

// 3) Settlement shop interaction
const playerInventory: ItemInventory = new Map();
mergeIntoInventory(playerInventory, [{ itemId: "coin", count: 18 }], () => 1);
mergeIntoInventory(playerInventory, [{ itemId: "bandage", count: 4 }], () => 2);

const shopOffer: TradeOffer = {
  give: [{ itemId: "wpn_club", count: 1, unitValue: resolveUnitValue("wpn_club") }],
  want: [{ itemId: "coin", count: 12, unitValue: 1 }],
};

const shopEval = evaluateTradeOfferDetailed(shopOffer, playerInventory);
console.log("settlement/shop", shopEval);
