import { generateIndividual } from "../src/generate.js";
import { HUMAN_BASE } from "../src/archetypes.js";
import { deriveJumpHeight_m } from "../src/derive.js";
import { SCALE, q, mulDiv } from "../src/units.js";

function debugJump() {
  const attrs = generateIndividual(1, HUMAN_BASE);
  console.log("=== Attributes ===");
  console.log("mass_kg (scaled):", attrs.morphology.mass_kg);
  console.log("mass real (kg):", attrs.morphology.mass_kg / SCALE.kg);
  console.log("reserveEnergy_J:", attrs.performance.reserveEnergy_J);
  console.log("conversionEfficiency (Q):", attrs.performance.conversionEfficiency);
  console.log("controlQuality (Q):", attrs.control.controlQuality);

  const reserveSpend_J = Math.trunc(attrs.performance.reserveEnergy_J / 6);
  console.log("\n=== Jump height call ===");
  console.log("reserveSpend_J:", reserveSpend_J);
  const jumpHeight = deriveJumpHeight_m(attrs, reserveSpend_J);
  console.log("jumpHeight (scaled):", jumpHeight);
  console.log("jumpHeight (m):", jumpHeight / SCALE.m);

  console.log("\n=== Manual step-by-step ===");
  const m = attrs.morphology.mass_kg;
  const Euse = Math.min(attrs.performance.reserveEnergy_J, reserveSpend_J);
  console.log("Euse:", Euse);

  // controlFactor = q(0.7) + qMul(q(0.3), controlQuality)
  const q_07 = q(0.7);
  const q_03 = q(0.3);
  const qMul_part = mulDiv(q_03, attrs.control.controlQuality, SCALE.Q);
  console.log("q_03 * controlQuality / SCALE.Q =", qMul_part);
  const controlFactor = q_07 + qMul_part;
  console.log("controlFactor (Q):", controlFactor);
  console.log("controlFactor (real):", controlFactor / SCALE.Q);

  // Eeff = mulDiv(mulDiv(Euse, conversionEfficiency, SCALE.Q), controlFactor, SCALE.Q)
  const step1 = mulDiv(Euse, attrs.performance.conversionEfficiency, SCALE.Q);
  console.log("Euse * convEff / SCALE.Q =", step1);
  const Eeff = mulDiv(step1, controlFactor, SCALE.Q);
  console.log("Eeff (scaled?):", Eeff);

  // denom = mulDiv(m, 9810, SCALE.kg)
  const denom = mulDiv(m, 9810, SCALE.kg);
  console.log("denom = m * 9810 / SCALE.kg =", denom);
  console.log("denom / SCALE.kg =", denom / SCALE.kg);
  console.log("m / SCALE.kg * 9.81 =", (m / SCALE.kg) * 9.81);

  // h = mulDiv(Eeff, SCALE.m, Math.max(1, denom))
  const h = mulDiv(Eeff, SCALE.m, Math.max(1, denom));
  console.log("h = Eeff * SCALE.m / denom =", h);
  console.log("h (m) =", h / SCALE.m);

  // Let's compute using real numbers
  console.log("\n=== Real unit calculation ===");
  const mass_kg = m / SCALE.kg;
  const Euse_J = Euse; // SCALE.J = 1
  const conv_eff = attrs.performance.conversionEfficiency / SCALE.Q;
  const control_factor = controlFactor / SCALE.Q;
  const Eeff_J = Euse_J * conv_eff * control_factor;
  console.log("Eeff_J:", Eeff_J);
  const g = 9.80665;
  const force_N = mass_kg * g;
  console.log("force_N:", force_N);
  const h_real = Eeff_J / force_N;
  console.log("h_real (m):", h_real);
  console.log("h_real * SCALE.m:", h_real * SCALE.m);

  // Compute using G_mps2
  console.log("\n=== Using G_mps2 ===");
  const G_mps2 = Math.round(g * SCALE.mps2);
  console.log("G_mps2:", G_mps2);
  // force_scaled = (m * G_mps2 * SCALE.N) / (SCALE.kg * SCALE.mps2)
  const force_scaled = mulDiv(mulDiv(m, G_mps2, SCALE.kg), SCALE.N, SCALE.mps2);
  console.log("force_scaled:", force_scaled);
  console.log("force_real from scaled:", force_scaled / SCALE.N);
  // h_scaled = (Euse * SCALE.m) / force_scaled
  const h_scaled2 = mulDiv(Euse, SCALE.m, force_scaled);
  console.log("h_scaled using G_mps2:", h_scaled2);
  console.log("h_real using G_mps2:", h_scaled2 / SCALE.m);
}

debugJump();