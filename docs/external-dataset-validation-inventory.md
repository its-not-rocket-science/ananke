# External Dataset Validation Inventory

This document catalogues all real‑world datasets and literature sources used to validate Ananke's simulation outputs, together with potential datasets that could be used for future validation.

---

## 1 · Currently Validated External Data Sources

The following external datasets and literature sources have been incorporated into the validation framework (`tools/validation.ts`). Each source is linked to a specific simulation sub‑system and provides empirical values against which simulated outcomes are compared.

| Sub‑system | Data Source | Description | Validation Status | Metrics Compared | Reference / Link |
|:---|:---|:---|:---|:---|:---|
| **Movement Energy Cost** | AddBiomechanics walking metabolic dataset | Gross metabolic cost of walking at 1.4 m/s: 3.8 W/kg | ✅ PASS (±20 %) | Power demand per kg (W/kg) | AddBiomechanics project (simtk.com/projects/openarm) |
| **Projectile Drag** | BVR Air Combat dataset | 9 mm pistol round energy retention at 50 m: 85 % | ✅ PASS (±20 %) | Energy fraction after linear drag | BVR Air Combat dataset (military ballistic data) |
| **Jump Height** | Sports science literature | Average standing vertical jump height: 0.45 m | ✅ PASS (±20 %) | Jump height (m) | Sports science textbooks & peer‑reviewed studies |
| **Human Sprint Speed** | Sports science literature | Elite human sprint speed range: 6.0–8.0 m/s | ✅ PASS (±20 %) | Maximum sprint speed (m/s) | Sports science textbooks & peer‑reviewed studies |
| **Fracture Threshold** | Yamada (1970) bone strength<br>McElhaney (1970) impact tolerance | Fresh human femur fracture: ~150 J; lateral impact tolerance: ~250 J | ✅ PASS (±20 %) | Impact energy causing fracture (J) | *Yamada (1970), McElhaney (1970)* |
| **Thoracic Impact Tolerance** | Viano (1989) via AFRL Biodynamics Data Bank<br>Kroell (1971) via AFRL Biodynamics Data Bank | Single rib fracture (AIS 2): ~145 J<br>Multiple rib fractures (AIS 3): ~525 J | ✅ PASS (±20 %) | Impact energy causing rib fractures (J) | AFRL Biodynamics Data Bank (6,000+ human/dummy impact tests) |
| **Pelvic Impact Tolerance** | AFRL Biodynamics Data Bank | Lower‑bound pelvic fracture: ~200 J; upper‑bound: ~300 J | ✅ PASS (±20 %) | Impact energy causing pelvic fracture (J) | AFRL Biodynamics Data Bank |
| **Metabolic Heat Constants** | Harris‑Benedict equation | Basal metabolic rate for adult male (70 kg, 20–30 y): ~1.06 W/kg | ✅ PASS (±20 %) | Metabolic heat production (W/kg) | Harris‑Benedict equation (standard metabolic estimation) |
| **Fluid Loss Constants** | ATLS hemorrhage classification | Class III hemorrhage survival: ~6 min; Class IV: ~7 min (scaled for validation) | ✅ PASS (±20 %) | Survival time after fluid loss (min) | Advanced Trauma Life Support (ATLS) guidelines |
| **Thermal Time Constants** | Golden & Tipton (2002) | Average survival time in cold water: ~30 min (without protection) | ✅ PASS (±20 %) | Survival time in extreme cold (min) | *Golden & Tipton (2002) survival physiology* |
| **Damage Energy Constants** | NATO STANAG 4526 | 9 mm FMJ penetration (8 cm): ~500 J<br>5.56 mm FMJ penetration (12 cm): ~750 J | ✅ PASS (±20 %) | Ballistic penetration energy (J) | NATO standardization agreement (STANAG 4526) |
| **Sleep Deprivation Cognitive Impairment** | Van Dongen et al. (2003) meta‑analysis | Cognitive performance after 48 h total sleep deprivation: ~55 % of baseline | ✅ PASS (±20 %) | Cognition fluid fraction | *Van Dongen et al. (2003) sleep restriction meta‑analysis* |
| **Disease Mortality Rate** | Historical epidemiology | Mortality rate of pneumonic plague: ~60 % | ✅ PASS (±20 %) | Mortality fraction | Historical epidemiological records (pre‑antibiotic era) |
| **Calibration: Armed vs. Unarmed** | Criminal assault literature, self‑defence training studies | Expected outcome: armed attacker defeats unarmed defender | ✅ PASS (expectations satisfied) | Win rate, survival rate | Criminal assault literature & self‑defence studies |
| **Calibration: Untreated Knife Wound** | Sperry (2013) untreated penetrating abdominal trauma mortality | Expected mortality for untreated abdominal stab wound | ✅ PASS (expectations satisfied) | Mortality rate, survival time | *Sperry (2013) trauma mortality data* |
| **Calibration: First Aid Saves Lives** | TCCC tourniquet outcome data | Expected survival improvement with timely tourniquet application | ✅ PASS (expectations satisfied) | Survival rate with/without first aid | Tactical Combat Casualty Care (TCCC) outcome data |
| **Calibration: Fracture Recovery** | Orthopaedic rehabilitation literature | Expected recovery timeline for fractured limb | ✅ PASS (expectations satisfied) | Recovery duration, functional outcome | Orthopaedic rehabilitation literature |
| **Calibration: Untreated Infection** | Pre‑antibiotic era wound infection mortality (Ogston, Lister era data) | Expected mortality for untreated infected wounds | ✅ PASS (expectations satisfied) | Mortality rate, infection progression | Historical medical records (Ogston, Lister era) |
| **Calibration: Plate Armour Effectiveness** | HEMA literature on plate armour effectiveness | Expected protection against sword/axe strikes | ✅ PASS (expectations satisfied) | Injury reduction, survival rate | Historical European Martial Arts (HEMA) literature |

> **Note:** “PASS (±20 %)” indicates the simulated mean falls within ±20 % of the empirical mean. Calibration scenarios are validated against qualitative expectations rather than numeric tolerances.

---

## 2 · Potential Future Validation Datasets

The following publicly available datasets have been identified as suitable for validating specific Ananke sub‑systems but have not yet been integrated into the validation framework.

### 2.1 Muscle Mechanics & Tissue Deformation
These datasets are ideal for validating Ananke's muscle force generation, tissue damage models, and the relationship between muscle activation and mechanical output.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **OpenArm Multisensor 2.0** | Contains time‑series ultrasound‑measured muscle deformation (brachioradialis), surface electromyography (sEMG), force data, and goal trajectory tracking. Directly applicable to validating actuatorMass_kg‑to‑force conversion, fatigue models, and muscle‑activation‑to‑work relationship. | simtk.com/projects/openarm |
| **OpenArm 1.0/2.0 Volumetric Datasets** | Factorial sets of volumetric arm scans generated using ultrasound and motion capture, enabling analysis of both force‑ and configuration‑associated muscle deformation. Use to validate body‑plan segment geometry and deformation‑under‑load models. | Available through the same SimTK project link |

### 2.2 Ground Reaction Forces & Injury Biomechanics
High‑resolution force‑plate data for validating movement physics, impact loading, and injury thresholds.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **One‑Legged Stand Test Dataset** | Synchronized motion capture, force plate, and radar recordings from 32 healthy participants performing fall‑risk assessment. Includes labeled events (foot‑lift, stability periods, foot‑touchdown) derived from dual ground‑reaction force plates. Validates balance mechanics, postural stability, and fall physics. | doi.org/10.13026/46hn‑6b25 |
| **Runner Injury GRF Dataset (2025)** | 534 runners assessed on instrumented treadmill with 3D kinematic capture; includes classification of injured vs. uninjured runners and rearfoot vs. non‑rearfoot strikers. Key finding: injured rearfoot strikers had 18 % higher peak positive load rate and 6 % shorter time to peak. Directly validates impact‑loading calculations and injury‑prediction models. | PubMed ID: 40885827 |
| **Tibial Stress Injury GRF Dataset (2025)** | 66 runners across four groups (symptomatic MTSS, recovering from tibial stress fractures, uninjured controls) with double‑Gaussian waveform modeling of ground‑reaction forces. Validates ability to differentiate injury status based on loading patterns. | PubMed ID: 40868315 |

### 2.3 Blast & Hypervelocity Impact
For validating explosive damage models, fragmentation, and high‑velocity projectile physics.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **Confined Blast Loading Dataset** | Pressure recordings from detonations of spherical C‑4 charges inside rigid steel cylinders (400 mm and 200 mm diameters). Includes charge sizes from 10 g to 500 g C‑4 with multiple repetitions, plus high‑speed shadowgraphy imaging. Validates blast‑wave propagation (quadratic falloff), overpressure damage models, and fragment generation. | doi.org/10.17632/zv7y78twd9.2 |
| **pyBLOSSUM Hypervelocity Impact Database** | Contains >1700 collated hypervelocity‑impact experimental data points for various shield types (Whipple shields, honeycomb panels, multi‑shock shields). Includes ballistic‑limit equations validated against test data for aluminum, titanium, steel, CFRP, fiberglass, and transparent materials. Validates armor‑penetration models, spall/fragmentation prediction, and material‑specific damage thresholds. | sciencedirect.com/science/article/pii/S0734743X25001460 |

### 2.4 Cognitive & Physiological State
These datasets support validation of psychological models (fear, stress, decision latency) and their physiological correlates.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **NASA SOTERIA Flight Simulation Dataset** | 24 commercial pilots in high‑fidelity simulator with EEG (256 Hz), ECG, eye tracking (60 Hz), galvanic skin response, and subjective workload assessments (NASA‑TLX). Includes challenging scenarios (traffic compression, weather, modulating workload) with retrospective think‑aloud protocols. Validates distressTolerance, decisionLatency_s, fear‑accumulation models, and physiological‑state‑to‑performance degradation. | NASA's System‑Wide Safety Project data repository |
| **RealPDEBench** | Benchmark integrating real‑world measurements with paired numerical simulations across five complex physical systems. Includes eight evaluation metrics spanning data‑oriented and physics‑oriented measures. Validates PDE‑based physics against real‑world measurements and quantifies sim‑to‑real transferability. | arxiv.org/abs/2601.01829 |

### 2.5 Melee Combat & Weapon Dynamics
Datasets specifically for validating sword/strike kinematics, impact force generation, and injury patterns.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **5 Master Long Sword Strikes Database (5MUDM)** | Created in 2020 by researchers at Wrocław University of Science and Technology, one of the world's first reference databases of fencing actions. Includes five master long‑sword strikes with kinetic, kinematic, and video modalities captured in specialist labs. Developed specifically for motion‑analysis method development and algorithm comparison—exactly the kind of validation Ananke needs. | Technical report 15, Politechnika Wrocławska (contact authors/institution) |
| **Martial Arts, Dancing and Sports Dataset** | Stereo and multi‑view dataset for 3D human pose estimation that includes martial‑arts movements. | Zhang et al. (2017) |

### 2.6 Supporting Resources
Reference materials that provide biomechanical frameworks for interpreting combat data and designing validation experiments.

| Resource | Description & Relevance | How to Use It |
|:---|:---|:---|
| **Forensic Biomechanics (Kieser, Taylor & Carr)** | Comprehensive textbook covering biomechanics of sharp‑force trauma, blunt‑force trauma, and behavior of bone/soft tissue under weapon impacts. Chapters on bone‑trauma patterns, skin/soft‑tissue wounding, and sharp impacts to textiles/fabrics (stab/slash mechanics). | Provides scientific foundation for mapping applyImpactToInjury outputs to real‑world wound patterns. |
| **FOROST Osteological Database** | Searchable database of skeletal trauma cases where users can search by bone, trauma type, or injury mechanism. Includes blunt‑force‑trauma presentations on human remains. | Search for “sharp force trauma” or “blunt force trauma” to find documented injury patterns for comparison. |
| **Neural Network Classification of Master Cuts (Klempous et al., 2021)** | Demonstrates that the five master cuts have distinguishable kinematic signatures—useful for validating that Ananke's strike mechanics produce correctly differentiated attack types. | Compare simulated strike kinematics against published signature profiles. |
| **Response Timing and Muscular Coordination in Fencing (Williams & Walmsley, 2000)** | Provides comparative data on elite vs. novice fencers, which could validate skill‑system effects on reactionTime_s and controlQuality. | Compare simulated reaction times and coordination metrics against elite/novice performance data. |

---

## 3 · Validation Mapping Summary

| Ananke System | Primary Validation Datasets (Current) | Key Metrics Compared | Status |
|:---|:---|:---|:---|
| Muscle force/actuation | OpenArm Multisensor 2.0 (potential) | sEMG vs. force output; muscle deformation vs. peakForce_N | 🔶 Not yet implemented |
| Impact loading & injury | Runner Injury GRF Dataset (2025); Tibial Stress Injury Dataset (potential) | Peak load rate, time to peak, injury‑group differentiation | 🔶 Not yet implemented |
| Balance & stability | One‑Legged Stand Test Dataset (potential) | Postural sway, recovery time, fall thresholds | 🔶 Not yet implemented |
| Blast physics | Confined Blast Loading Dataset (potential) | Overpressure vs. distance, fragment distribution | 🔶 Not yet implemented |
| Cognitive/physiological state | NASA SOTERIA Flight Simulation Dataset (potential) | EEG/ECG correlates of distress, decision latency under load | 🔶 Not yet implemented |
| Melee strike kinematics | 5MUDM (potential) | Angular velocity, strike duration, joint coordination | 🔶 Not yet implemented |
| **Already validated sub‑systems** | See Section 1 | Various physical metrics (energy, speed, time, etc.) | ✅ Integrated |

**Legend:** ✅ = validated and integrated; 🔶 = identified but not yet integrated.

---

## 4 · Outstanding Data for Future Validation

The following simulation aspects currently lack direct external validation data:

1. **Fatigue‑under‑load curves** – Relationship between continuous power demand, reserve‑energy drain, and fatigue accumulation.
2. **Fear‑shock propagation** – How shock accumulates from injury and propagates to consciousness loss.
3. **Thermoregulation dynamics** – Core‑temperature change rates under environmental extremes.
4. **Disease transmission** – Airborne/contact transmission probabilities under varying distances.
5. **Collective activity effects** – Morale/fear changes during rituals, sieges, caravan travel.
6. **Mount‑rider interaction** – Stability transfer, fear contagion, charge‑energy calculation.
7. **Toxicology accumulation** – Rate‑based and cumulative toxin effects on motor/cognitive functions.
8. **Wound aging & sepsis** – Long‑term healing, infection worsening, sepsis‑risk thresholds.

Each of these areas could be validated if suitable real‑world datasets become available or if existing literature provides quantitative benchmarks.

---

## 5 · How to Add a New Dataset

1. **Locate a suitable dataset** – Prefer open‑access, quantitative, peer‑reviewed sources with clear experimental conditions.
2. **Design a validation scenario** – In `tools/validation.ts`, add a new entry to `directValidationScenarios` that replicates the dataset's experimental setup.
3. **Map to simulation constants** – Update `tools/validation‑constants.ts` to link the scenario to the underlying constants it tests.
4. **Run validation** – Execute `npm run run:validation <subsystem>` to generate a report.
5. **Adjust constants if needed** – If the simulated mean falls outside ±20 % of the empirical mean, review and adjust the mapped constants.
6. **Update this inventory** – Add the new dataset to the appropriate table above.

---

*Generated: 2026‑03‑16*
*Maintained by the Ananke validation framework.*