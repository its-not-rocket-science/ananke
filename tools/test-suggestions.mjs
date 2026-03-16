import { generateConstantSuggestions } from '../dist/tools/validation-constants.js';

console.log('=== Testing constant suggestions ===\n');

// Case 1: Surface Damage Constant, simulated 10% higher
console.log('1. Surface Damage Constant (simulated 10% higher)');
const s1 = generateConstantSuggestions('Surface Damage Constant', 7623, 6930);
console.log(s1 || '(no suggestions)');

// Case 2: Grappling Grip Decay, simulated 30% lower
console.log('\n2. Grappling Grip Decay (simulated 30% lower)');
const s2 = generateConstantSuggestions('Grappling Grip Decay', 0.0035, 0.005);
console.log(s2 || '(no suggestions)');

// Case 3: Multiple constants (Impact Energy Distribution)
console.log('\n3. Impact Energy Distribution (simulated 20% higher)');
const s3 = generateConstantSuggestions('Impact Energy Distribution', 600, 500);
console.log(s3 || '(no suggestions)');

// Case 4: Unmapped scenario
console.log('\n4. Unmapped scenario');
const s4 = generateConstantSuggestions('Metabolic Heat Constants', 1.0, 1.06);
console.log(s4 || '(empty string)');

// Edge case: simulated mean zero (division by zero)
console.log('\n5. Simulated mean zero');
const s5 = generateConstantSuggestions('Surface Damage Constant', 0, 6930);
console.log(s5 || '(no suggestions)');