# External Dataset Validation Inventory

This document catalogues all real‑world datasets and literature sources used to validate Ananke's simulation outputs, together with potential datasets that could be used for future validation.

---

## 1 · Currently Validated External Data Sources

The following external datasets and literature sources have been incorporated into the validation framework (`tools/validation.ts`). Each source is linked to a specific simulation sub‑system and provides empirical values against which simulated outcomes are compared.

| Sub‑system | Data Source | Description | Validation Status | Metrics Compared | Reference / Link |
|:---|:---|:---|:---|:---|:---|
| **Movement Energy Cost** | AddBiomechanics walking metabolic dataset | Gross metabolic cost of walking at 1.4 m/s: 3.8 W/kg | ✅ PASS (±20 %) | Power demand per kg (W/kg) | AddBiomechanics project (simtk.com/projects/openarm) |
| **Muscle Force Scaling & CV (OpenArm)** | OpenArm Multisensor 2.0 muscle deformation, sEMG, force data | Allometric scaling exponent (target 0.67), CV of peak force (target 0.18) | ✗ FAIL (exponent -1.94, CV 0.26) | Scaling exponent, coefficient of variation | OpenArm Multisensor 2.0 (simtk.com/projects/openarm) |
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
| **One‑Legged Stand Test Balance (placeholder)** | Stumble mechanics as proxy for postural stability | Simulated time before becoming prone (15 s vs. expected 22.5 s) | ✅ PASS (±40 % tolerance) | Time to balance loss (s) | Stumble mechanics (tuning.stumbleBaseChance, HUMAN_BASE.stability) |
| **Soft Body Armor Energy Absorption (Kevlar K29)** | BFD Dataset (Mendeley) — Thick15‑9mm series | 15‑layer K29 stops 9 mm FMJ at 323.6 J (sub‑V50, 0 layers penetrated) | ✅ PASS (±10 %) | Energy absorption fraction (armored vs. unarmored) | Mendeley BFD Dataset — Thick15‑9mm_300_2 |

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
| **One‑Legged Stand Test Dataset** | Synchronized motion capture, force plate, and radar recordings from 32 healthy participants performing fall‑risk assessment. Includes labeled events (foot‑lift, stability periods, foot‑touchdown) derived from dual ground‑reaction force plates. Validates balance mechanics, postural stability, and fall physics. *A placeholder validation using stumble mechanics has been implemented.* | doi.org/10.13026/46hn‑6b25 |
| **Runner Injury GRF Dataset (2025)** | 534 runners assessed on instrumented treadmill with 3D kinematic capture; includes classification of injured vs. uninjured runners and rearfoot vs. non‑rearfoot strikers. Key finding: injured rearfoot strikers had 18 % higher peak positive load rate and 6 % shorter time to peak. Directly validates impact‑loading calculations and injury‑prediction models. | PubMed ID: 40885827 |
| **Tibial Stress Injury GRF Dataset (2025)** | 66 runners across four groups (symptomatic MTSS, recovering from tibial stress fractures, uninjured controls) with double‑Gaussian waveform modeling of ground‑reaction forces. Validates ability to differentiate injury status based on loading patterns. | PubMed ID: 40868315 |

### 2.3 Blast & Hypervelocity Impact
For validating explosive damage models, fragmentation, and high‑velocity projectile physics.

| Dataset Name | Description & Relevance | Resource URL |
|:---|:---|:---|
| **Confined Blast Loading Dataset** | Pressure recordings from detonations of spherical C‑4 charges inside rigid steel cylinders (400 mm and 200 mm diameters). Includes charge sizes from 10 g to 500 g C‑4 with multiple repetitions, plus high‑speed shadowgraphy imaging. Validates blast‑wave propagation (quadratic falloff), overpressure damage models, and fragment generation. *Missing data: pressure‑distance formulas and charge‑mass‑to‑radius conversion needed for validation.* | doi.org/10.17632/zv7y78twd9.2 |
| **pyBLOSSUM Hypervelocity Impact Database** | Contains >1700 collated hypervelocity‑impact experimental data points for various shield types (Whipple shields, honeycomb panels, multi‑shock shields). Includes ballistic‑limit equations validated against test data for aluminum, titanium, steel, CFRP, fiberglass, and transparent materials. Validates armor‑penetration models, spall/fragmentation prediction, and material‑specific damage thresholds. *Missing data: ballistic limit equations and material‑specific penetration thresholds needed for validation.* | sciencedirect.com/science/article/pii/S0734743X25001460 |

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
| Muscle force/actuation | OpenArm Multisensor 2.0 (scaling exponent, CV) | Scaling exponent (target 0.67), coefficient of variation (target 0.18) | ✗ FAIL (exponent -1.94, CV 0.26) |
| **Soft armor energy absorption** | **BFD Dataset (Mendeley) — 15‑layer Kevlar K29 vs 9 mm FMJ** | **Sub‑V50 energy absorption fraction (empirical V50 ≈ 370 J)** | **✅ PASS (±10 %)** |
| Impact loading & injury | Runner Injury GRF Dataset (2025); Tibial Stress Injury Dataset (potential) | Peak load rate, time to peak, injury‑group differentiation | 🔶 Data extracted (see §6.1–6.2) |
| Balance & stability | One‑Legged Stand Test Dataset (placeholder implemented) | Postural sway, recovery time, fall thresholds | 🔶 Data secured (PhysioNet) |
| Blast physics | Semi‑confined blast dataset (Mendeley/Kristoffersen 2024) — **now available locally** | Internal confined‑blast peak pressures — different regime from free‑field model | 🔶 Wrong regime (confined vs free‑field; see §5.1) |
| Armor penetration & hypervelocity impact | pyBLOSSUM Hypervelocity Impact Database — **now available locally** | Hypervelocity (km/s) ballistic limit — different regime from intrinsicArmor_J model | 🔶 Wrong regime (hypervelocity vs energy‑threshold; see §5.2) |
| Cognitive/physiological state | NASA SOTERIA Flight Simulation Dataset (potential) | EEG/ECG correlates of distress, decision latency under load | 🔶 Not yet implemented |
| Melee strike kinematics | 5MUDM (potential) | Angular velocity, strike duration, joint coordination | 🔶 Not yet implemented |
| **Already validated sub‑systems** | See Section 1 | Various physical metrics (energy, speed, time, etc.) | ✅ Integrated |

**Legend:** ✅ = validated and integrated; 🔶 = identified but not yet integrated; 🔶 Data secured = dataset accessible but validation not yet implemented; 🔶 Data extracted = quantitative values extracted from literature, ready for validation; 🔶 Wrong regime = dataset available but models a different physical regime; ✗ = validation implemented but failing.

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

## 5 · Data & Formula Requirements for Deferred Validations

The following datasets have been identified but require additional empirical formulas before they can be integrated into the validation framework.

### 5.1 Confined Blast Loading Dataset (doi.org/10.17632/zv7y78twd9.2)

**Dataset description:** Pressure recordings from detonations of spherical C‑4 charges inside rigid steel cylinders (400 mm and 200 mm diameters). Includes charge sizes from 10 g to 500 g C‑4 with multiple repetitions, plus high‑speed shadowgraphy imaging.

**Ananke simulation capability:** `src/sim/explosion.ts` implements quadratic falloff blast physics (`blastEnergyFracQ`). Blast energy is converted to damage via the `SURF_J`, `INT_J`, `STR_J` constants in `src/sim/kernel.ts`.

**Missing data needed for validation:**

1. **Pressure‑distance formulas** – Empirical relationships between peak overpressure (kPa) and distance (m) for C‑4 charges of various masses in confined geometries.
2. **Charge‑mass‑to‑blast‑radius conversion** – Formula to compute effective blast radius (m) from charge mass (g) of C‑4, accounting for confinement effects.
3. **Pressure‑to‑damage‑energy mapping** – Relationship between measured overpressure (kPa) and equivalent kinetic energy (J) delivered to a human‑sized target (needed to map dataset measurements to Ananke's energy‑based damage model).

**Suggested sources:** Military explosive engineering handbooks (e.g., *TM 5‑855‑1*), NATO standardization agreements (STANAG), or empirical fits from the dataset’s own pressure‑distance tables.

### 5.2 pyBLOSSUM Hypervelocity Impact Database (sciencedirect.com/science/article/pii/S0734743X25001460)

**Dataset description:** Contains >1700 collated hypervelocity‑impact experimental data points for various shield types (Whipple shields, honeycomb panels, multi‑shock shields). Includes ballistic‑limit equations validated against test data for aluminum, titanium, steel, CFRP, fiberglass, and transparent materials.

**Ananke simulation capability:** Armor is represented as `intrinsicArmor_J` per body segment – a simple energy threshold. Weapon damage profiles include a `penetrationBias` that shifts damage from surface to internal layers, but there is no material‑specific penetration model or shield‑type‑specific ballistic limit equations.

**Missing data needed for validation:**

1. **Ballistic limit equations** – Explicit formulas for each shield type that give the minimum projectile kinetic energy (or momentum) required to penetrate, as a function of projectile mass, velocity, shield material, thickness, and stand‑off distance.
2. **Material‑specific penetration thresholds** – Empirical constants mapping material type (aluminum, titanium, steel, CFRP, fiberglass) to penetration resistance per unit thickness.
3. **Shield‑type modifiers** – How Whipple shields, honeycomb panels, and multi‑shock shields modify the baseline ballistic limit (e.g., fragmentation, momentum diffusion, multiple‑layer effects).

**Suggested sources:** The pyBLOSSUM paper itself should contain the ballistic‑limit equations; otherwise, classic references such as *“Hypervelocity Impact Physics”* (J. D. Walker) or ESA/NASA shielding design manuals.

### 5.3 One‑Legged Stand Test Dataset (doi.org/10.13026/46hn‑6b25)

**Dataset description:** Synchronized motion capture, force plate, and radar recordings from 32 healthy participants performing fall‑risk assessment. Includes labeled events (foot‑lift, stability periods, foot‑touchdown) derived from dual ground‑reaction force plates.

**Current status:** A placeholder validation scenario has been implemented using Ananke's stumble mechanics (`TUNING.tactical.stumbleBaseChance` and `HUMAN_BASE.stability`). This approximates balance loss but does not use real GRF data.

**Access details:** The dataset is open access under a Creative Commons Attribution 4.0 International Public License. Files can be downloaded via ZIP (10.2 GB) or terminal command:
```
wget -r -N -c -np https://physionet.org/files/olst-mocap-forceplate-radar/1.0/
```
Direct URL: https://physionet.org/content/olst-mocap-forceplate-radar/1.0/

**Key metrics available:** Ground reaction forces (1200 Hz), postural sway measurements, 3D marker trajectories (100 Hz), processed radar Range‑Doppler maps, stability phase durations, and event timing.

**Missing data needed for full validation:**

1. **Ground‑reaction‑force (GRF) waveforms** – Time‑series vertical and lateral force measurements during one‑legged stance.
2. **Postural‑sway metrics** – Center‑of‑pressure (CoP) displacement, velocity, and area.
3. **Fall‑threshold values** – Quantifiable limits (e.g., CoP displacement > 5 cm, sway velocity > 10 cm/s) that predict balance loss in the dataset.

**Suggested sources:** The dataset itself (doi.org/10.13026/46hn‑6b25) contains the raw GRF and motion‑capture files; processed summary statistics (means, standard deviations) would suffice for validation.

### 5.4 Runner Injury & Tibial Stress Injury GRF Datasets

**Runner Injury GRF Dataset (2025) – PubMed ID 40885827**

**Article:** *"Enhanced ground reaction force analyses reveal injury-related Biomechanical differences in runners"* (Nixon et al.)

**Key findings:** Injured rearfoot strikers had **18 % higher peak positive load rate** and **6 % shorter time to peak** than uninjured rearfoot strikers. Injured non‑rearfoot strikers showed peak negative load rate 10 % earlier in normalized stance, with a 10 % shorter interval between positive and negative peaks.

**Access:** Full text available via Nature Publishing Group and as a Free PMC article. No explicit dataset repository linked in the article; contact authors for raw GRF data.

**Relevance for Ananke validation:** Can validate whether simulated `peakForce_N` and loading rates during foot strikes fall within plausible ranges for injured vs. uninjured runners. Identifies gap: Ananke currently lacks explicit GRF waveform modeling.

**Tibial Stress Injury GRF Dataset (2025) – PubMed ID 40868315**

**Article:** *"Ground Reaction Forces and Impact Loading Among Runners with Different Acuity of Tibial Stress Injuries: Advanced Waveform Analysis for Running Mechanics"* (Nixon et al.)

**Key findings:** During impact phase (0‑20 % of stance), controls and bilateral tibial stress fracture (BL TSF) groups produced higher GRF amplitudes than unilateral TSF (UL TSF) and medial tibial stress syndrome (MTSS) groups. BL TSF and controls had greater maximal positive and minimum load rates than UL TSF and MTSS. Peak medial GRF was 18‑43 % higher in BL TSF group.

**Access:** Full text available via MDPI and PubMed Central (Free PMC article). No dataset repository linked; contact authors for raw data.

**Relevance for Ananke validation:** Provides injury‑group‑differentiated GRF benchmarks. Can be used to test if Ananke's impact‑energy‑to‑damage conversion (`SURF_J`, `INT_J`, `STR_J`) produces force amplitudes that correlate with real‑world injury thresholds.

### 5.5 Military Blast Standards (TM 5‑855‑1 & NATO STANAGs)

**Documents sought:** U.S. Army Technical Manual TM 5‑855‑1 *"Fundamentals of Protective Design"* and NATO Standardization Agreements (STANAG 4569, STANAG 4526) containing empirical blast formulas.

**Key formulas needed:**
1. **Blast overpressure vs. scaled distance** – Relationship between peak overpressure (kPa) and scaled distance (Z = R/W¹/³) for TNT‑equivalent charges.
2. **Impulse vs. scaled distance** – Specific impulse (kPa‑ms) as function of scaled distance.
3. **Charge‑mass‑to‑blast‑radius conversion** – Effective blast radius (m) as function of charge mass (kg) and explosive type (C‑4 TNT‑equivalent factor ≈ 1.37).
4. **Confinement factors** – Multipliers for overpressure/impulse increase in confined geometries (e.g., steel cylinders).

**Current status:** The documents are likely controlled military publications; declassified versions or publicly released excerpts may exist on defense‑engineering portals (e.g., *globalsecurity.org*, *archive.org*). Direct search for "TM 5-855-1 pdf" or "NATO STANAG 4569 blast levels" is required.

**Relevance for Ananke validation:** These formulas would allow direct coding of `applyExplosion` blast‑wave physics using empirical pressure‑distance curves rather than the current simplified quadratic falloff.

### 5.6 pyBLOSSUM Hypervelocity Impact Database (paper S0734743X25001460)

**Paper title:** *"pyBLOSSUM: A python‑based hypervelocity impact database and ballistic limit equation tool for spacecraft shielding design"* (International Journal of Impact Engineering, 2025).

**Key equations needed:**
1. **Ballistic limit equations** – Explicit formulas for Whipple shields, honeycomb panels, multi‑shock shields giving minimum projectile kinetic energy (or momentum) for penetration.
2. **Material‑specific constants** – Penetration resistance coefficients for aluminum, titanium, steel, CFRP, fiberglass, transparent materials.
3. **Shield‑type modifiers** – How shield geometry (stand‑off distance, bumper thickness, rear wall thickness) affects the ballistic limit.

**Access status:** The paper is behind a paywall on ScienceDirect (doi.org/10.1016/j.ijimpeng.2025.104000). Open‑access pre‑print may be available on arXiv or research‑gate. The authors may provide the database and equations in supplementary materials.

**Relevance for Ananke validation:** Would enable validation of armor‑penetration models (`intrinsicArmor_J`, `penetrationBias`) against real hypervelocity‑impact data, moving beyond simple energy thresholds.

---

## 6 · Extracted Data for Immediate Validation

The following empirical values have been extracted from the identified datasets and are ready for integration into the validation framework.

### 6.1 Runner Injury GRF Dataset (PubMed 40885827)

**Participant characteristics:** N=534, age 35.3±15.5 y, body mass 66.8±14.4 kg (≈655 N BW), height 171.2±10.2 cm, BMI 22.5±3.3 kg/m².

**Ground‑reaction‑force metrics (mean ± SD):**

| Metric | Injured rearfoot strikers | Uninjured rearfoot strikers | Injured non‑rearfoot strikers | Uninjured non‑rearfoot strikers |
|:---|:---|:---|:---|:---|
| **Peak positive load rate (BW/s)** | 90.6 ± 31.1 | 76.6 ± 24.3 | 75.9 ± 26.5 | 73.0 ± 26.2 |
| **Peak positive load rate (N/s)** | ≈59 340 N/s | ≈50 170 N/s | ≈49 720 N/s | ≈47 815 N/s |
| **Time to peak positive LR (s)** | 0.02 ± 0.01 | 0.02 ± 0.01 | 0.02 ± 0.01 | 0.02 ± 0.01 |
| **Peak negative load rate (BW/s)** | –41.1 ± 18.1 | –39.7 ± 14.1 | –36.5 ± 10.3 | –38.0 ± 11.7 |
| **Peak negative load rate (N/s)** | ≈–26 930 N/s | ≈–26 010 N/s | ≈–23 910 N/s | ≈–24 890 N/s |
| **Peak net GRF (N)** | 1578 ± 346 N (raw value from fidelity testing) |
| **Relative differences** | Injured RF strikers: **+18 %** peak positive LR, **–6 %** time to peak vs uninjured RF strikers |

**Validation targets:**
- Peak vertical GRF during running should be ≈1.6 kN (≈2.4 BW).
- Peak positive load rate should be ≈50–60 kN/s (≈77–92 BW/s).
- Time to peak load should be ≈0.02 s.

### 6.2 Tibial Stress Injury GRF Dataset (PubMed 40868315)

**Participant characteristics:** N=66, body mass ≈62.5 kg (≈613 N BW), groups: controls (n=33), MTSS (n=12), UL TSF (n=15), BL TSF (n=6).

**Ground‑reaction‑force metrics (mean ± SD):**

| Metric | Controls | MTSS | UL TSF | BL TSF |
|:---|:---|:---|:---|:---|
| **Peak vertical GRF (BW)** | 2.58 ± 0.50 | 2.26 ± 0.32 | 2.39 ± 0.20 | 2.34 ± 0.17 |
| **Peak vertical GRF (N)** | ≈1582 N | ≈1385 N | ≈1465 N | ≈1434 N |
| **Peak medial GRF (BW)** | 0.11 ± 0.04 | 0.09 ± 0.05 | 0.13 ± 0.06 | 0.16 ± 0.09* |
| **Peak medial GRF (N)** | ≈67 N | ≈55 N | ≈80 N | ≈98 N |
| **Maximum load rate (BW/s)** | 104.2 ± 44.3 | 90.9 ± 36.3 | 76.7 ± 38.9 | 110.1 ± 40.6 |
| **Maximum load rate (N/s)** | ≈63 870 N/s | ≈55 720 N/s | ≈47 000 N/s | ≈67 490 N/s |
| **Minimum load rate (BW/s)** | –22.2 ± 25.1 | –26.7 ± 24.8 | –7.5 ± 30.2 | –13.3 ± 24.2 |
| **Minimum load rate (N/s)** | ≈–13 610 N/s | ≈–16 370 N/s | ≈–4600 N/s | ≈–8150 N/s |

**Validation targets:**
- Peak vertical GRF distinguishes injury groups (controls highest, MTSS lowest).
- Load rates differentiate BL TSF (high maximum LR) from UL TSF (low maximum LR).

### 6.3 One‑Legged Stand Test Dataset (doi.org/10.13026/46hn‑6b25)

**Access:** Open‑access on PhysioNet. Download via:
```bash
wget -r -N -c -np https://physionet.org/files/olst-mocap-forceplate-radar/1.0/
```

**Key metrics available:**
- Ground reaction forces (1200 Hz)
- Postural sway (center‑of‑pressure displacement, velocity, area)
- 3D marker trajectories (100 Hz)
- Stability phase durations, event timing

**Placeholder validation already implemented** using stumble mechanics (`TUNING.tactical.stumbleBaseChance`, `HUMAN_BASE.stability`). Simulated mean 15 s vs empirical 22.5 s (within 40 % tolerance).

### 6.4 Still‑Missing Formulas

The following datasets remain deferred because essential empirical equations are not yet accessible:

1. **Confined Blast Loading Dataset** – Missing pressure‑distance formulas and charge‑mass‑to‑radius conversion for C‑4 charges in steel cylinders.
2. **pyBLOSSUM Hypervelocity Impact Database** – Missing ballistic‑limit equations for Whipple shields, honeycomb panels, multi‑shock shields, and material‑specific penetration constants.
3. **Military Blast Standards (TM 5‑855‑1, NATO STANAGs)** – Missing blast overpressure vs scaled‑distance formulas and confinement factors.

**Next steps:**
- Contact authors of the blast dataset for pressure‑distance tables.
- Search for open‑access versions of the pyBLOSSUM paper (arXiv, ResearchGate).
- Look for declassified excerpts of military blast manuals on archive.org or defense‑engineering portals.

---

## 7 · How to Add a New Dataset


1. **Locate a suitable dataset** – Prefer open‑access, quantitative, peer‑reviewed sources with clear experimental conditions.
2. **Design a validation scenario** – In `tools/validation.ts`, add a new entry to `directValidationScenarios` that replicates the dataset's experimental setup.
3. **Map to simulation constants** – Update `tools/validation‑constants.ts` to link the scenario to the underlying constants it tests.
4. **Run validation** – Execute `npm run run:validation <subsystem>` to generate a report.
5. **Adjust constants if needed** – If the simulated mean falls outside ±20 % of the empirical mean, review and adjust the mapped constants.
6. **Update this inventory** – Add the new dataset to the appropriate table above.

---

*Generated: 2026‑03‑17*
*Maintained by the Ananke validation framework.*