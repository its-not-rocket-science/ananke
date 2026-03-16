const { generateIndividual } = require('../dist/generate.js');
const { HUMAN_BASE } = require('../dist/archetypes.js');
const { SCALE } = require('../dist/units.js');

const N = 100;
let sumMass = 0, sumForce = 0, sumLogMass = 0, sumLogForce = 0, sumLogMassLogForce = 0, sumLogMassSq = 0;
for (let i = 0; i < N; i++) {
  const attrs = generateIndividual(i, HUMAN_BASE);
  const mass_kg = attrs.morphology.mass_kg / SCALE.kg;
  const force_N = attrs.performance.peakForce_N / SCALE.N;
  const logMass = Math.log(mass_kg);
  const logForce = Math.log(force_N);
  sumMass += mass_kg;
  sumForce += force_N;
  sumLogMass += logMass;
  sumLogForce += logForce;
  sumLogMassLogForce += logMass * logForce;
  sumLogMassSq += logMass * logMass;
  console.log(`${i}: mass=${mass_kg.toFixed(2)} kg, force=${force_N.toFixed(1)} N, logM=${logMass.toFixed(4)}, logF=${logForce.toFixed(4)}`);
}
const cov = sumLogMassLogForce - sumLogMass * sumLogForce / N;
const varX = sumLogMassSq - sumLogMass * sumLogMass / N;
const slope = cov / varX;
console.log(`\nSlope (exponent) = ${slope}`);
console.log(`Average mass = ${sumMass/N}, average force = ${sumForce/N}`);
