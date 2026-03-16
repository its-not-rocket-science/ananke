// Quick test of constant suggestion generation
import { generateConstantSuggestions } from "./validation-constants.js";

// Test case: Surface Damage Constant with simulated mean 10% higher than empirical
console.log("Test 1: Surface Damage Constant");
const suggestions1 = generateConstantSuggestions(
  "Surface Damage Constant",
  7623, // simulated mean (10% higher than 6930)
  6930  // empirical mean
);
console.log(suggestions1);

// Test case: Grappling Grip Decay with simulated mean 30% lower
console.log("\nTest 2: Grappling Grip Decay");
const suggestions2 = generateConstantSuggestions(
  "Grappling Grip Decay",
  0.0035, // simulated
  0.005   // empirical
);
console.log(suggestions2);

// Test case: Scenario not mapped
console.log("\nTest 3: Unmapped scenario");
const suggestions3 = generateConstantSuggestions(
  "Metabolic Heat Constants",
  1.0,
  1.06
);
console.log(suggestions3 || "(empty string)");