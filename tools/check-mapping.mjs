import { getConstantsForScenario } from '../dist/tools/validation-constants.js';

console.log('Surface Damage Constant:');
console.log(getConstantsForScenario('Surface Damage Constant'));
console.log('\nGrappling Grip Decay:');
console.log(getConstantsForScenario('Grappling Grip Decay'));
console.log('\nToxicology Radiation Dose:');
console.log(getConstantsForScenario('Toxicology Radiation Dose'));
console.log('\nUnmapped scenario:');
console.log(getConstantsForScenario('Metabolic Heat Constants'));