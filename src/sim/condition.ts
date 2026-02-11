import type { Q } from "../units";
import { q } from "../units";

export interface ConditionState {
  // Intensities are 0..1 in Q unless otherwise noted
  onFire: Q;              // thermal exposure intensity
  corrosiveExposure: Q;   // chemical/corrosive exposure intensity
  radiation: Q;           // radiation intensity
  electricalOverload: Q;  // electrical hazard intensity

  suffocation: Q;         // hypoxia / vacuum / fluid intrusion analogue
  stunned: Q;             // control disruption intensity

  prone: boolean;
}

export const defaultCondition = (): ConditionState => ({
  onFire: q(0),
  corrosiveExposure: q(0),
  radiation: q(0),
  electricalOverload: q(0),
  suffocation: q(0),
  stunned: q(0),
  prone: false,
});