import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { deriveJumpHeight_m } from "../src/derive.js";
import { SCALE, q } from "../src/units.js";

function debugJump() {
  const attrs = generateIndividual(1, HUMAN_BASE);
  console.log("Mass (scaled):", attrs.morphology.mass_kg);
  console.log("Mass (real kg):", attrs.morphology.mass_kg / SCALE.kg);
  console.log("Reserve energy (J):", attrs.performance.reserveEnergy_J);
  const reserveSpend_J = Math.trunc(attrs.performance.reserveEnergy_J / 6);
  console.log("Reserve spend (J):", reserveSpend_J);
  console.log("Conversion efficiency (Q):", attrs.performance.conversionEfficiency);
  console.log("Conversion efficiency (real):", attrs.performance.conversionEfficiency / SCALE.Q);
  console.log("Control quality (Q):", attrs.control.controlQuality);
  console.log("Control quality (real):", attrs.control.controlQuality / SCALE.Q);

  const m = attrs.morphology.mass_kg;
  const controlFactor = q(0.7) + (q(0.3) * attrs.control.controlQuality) / SCALE.Q;
  console.log("Control factor (real):", controlFactor);
  const controlFactorQ = Math.round(controlFactor * SCALE.Q);
  console.log("Control factor (Q):", controlFactorQ);

  const Euse = reserveSpend_J;
  const Eeff = (Euse * attrs.performance.conversionEfficiency * controlFactorQ) / (SCALE.Q * SCALE.Q);
  console.log("Eeff (J):", Eeff);

  const denom = (m * 9810) / SCALE.kg;
  console.log("Denom:", denom);
  console.log("Denom / SCALE.kg:", denom / SCALE.kg);
  console.log("Expected force (N):", (m / SCALE.kg) * 9.81);

  const jumpHeight = deriveJumpHeight_m(attrs, reserveSpend_J);
  console.log("Jump height (scaled):", jumpHeight);
  console.log("Jump height (real m):", jumpHeight / SCALE.m);

  // Manual computation using proper scaling
  const force_real = (m / SCALE.kg) * 9.80665;
  const h_real = Eeff / force_real;
  console.log("Expected height (real m):", h_real);

  // Using G_mps2
  const G_mps2 = Math.round(9.80665 * SCALE.mps2);
  console.log("G_mps2:", G_mps2);
  const force_scaled = (m * G_mps2 * SCALE.N) / (SCALE.kg * SCALE.mps2);
  console.log("Force scaled:", force_scaled);
  console.log("Force real from scaled:", force_scaled / SCALE.N);
  const h_scaled = (Euse * SCALE.m) / force_scaled;
  console.log("Height scaled using G_mps2:", h_scaled);
  console.log("Height real using G_mps2:", h_scaled / SCALE.m);
}

debugJump();