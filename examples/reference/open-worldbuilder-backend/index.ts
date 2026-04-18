import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  runOpenWorldBuilderReferenceDemo,
  type OpenWorldHostInput,
} from "../../../src/world-evolution-backend/index.js";

const fixturePath = fileURLToPath(new URL("../../../../fixtures/world-evolution-open-worldbuilder/generated-world-host-fixture.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as OpenWorldHostInput;

const output = runOpenWorldBuilderReferenceDemo(
  fixture,
  {
    label: "baseline",
    steps: 540,
    checkpointInterval: 90,
    profileId: "full_world_evolution",
  },
  {
    label: "altered_policy_shock",
    steps: 540,
    checkpointInterval: 90,
    profileId: "full_world_evolution",
    profileTweaks: {
      routeEfficiencyBoost_Q: 22,
      treatyStrengthBoost_Q: -14,
      epidemicHealthBuffer_Q: 40,
    },
  },
);

console.log("OpenWorldBuilder → Ananke deterministic backend reference demo");
console.log(JSON.stringify(output, null, 2));
