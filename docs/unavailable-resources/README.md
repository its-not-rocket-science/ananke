# Unavailable Resources for Validation

This directory is for storing resources that could not be downloaded automatically but are needed to complete deferred validations.

When you locate any of these files, save them here with the suggested filename. The validation framework will check this directory when attempting to integrate these datasets.

---

## 1. Confined Blast Loading Dataset

**What we need:** Pressure‑distance formulas and charge‑mass‑to‑radius conversion for C‑4 charges in steel cylinders.

**Dataset source:** doi.org/10.17632/zv7y78twd9.2 (Mendeley Data)

**Attempted access:** No direct download attempted (requires manual download).

**Required files:**
- `confined-blast-pressure-tables.csv` – Tabular data of peak overpressure (kPa) vs distance (m) for various C‑4 charge masses.
- `confined-blast-formulas.txt` – Empirical fits (e.g., `P_peak = f(R, W)`) derived from the dataset.

**How to obtain:**
1. Visit https://data.mendeley.com/datasets/zv7y78twd9.2
2. Download the complete dataset (ZIP)
3. Extract pressure‑distance tables from the raw data or supplementary materials.

**Use in validation:** These formulas will allow coding of `applyExplosion` blast‑wave physics using empirical pressure‑distance curves rather than the current simplified quadratic falloff.

---

## 2. pyBLOSSUM Hypervelocity Impact Database

**What we need:** Ballistic‑limit equations for Whipple shields, honeycomb panels, multi‑shock shields, and material‑specific penetration constants.

**Paper source:** *"pyBLOSSUM: A python‑based hypervelocity impact database and ballistic limit equation tool for spacecraft shielding design"* (International Journal of Impact Engineering, 2025). DOI: 10.1016/j.ijimpeng.2025.104000

**Attempted access:**
- ScienceDirect paywall (403/404)
- No open‑access pre‑print located

**Required files:**
- `pyblossum-paper.pdf` – The full article (PDF)
- `pyblossum-equations.txt` – Extracted ballistic‑limit equations in plain text
- `pyblossum-database.csv` – The >1700‑point impact database (if available)

**How to obtain:**
1. Access via institutional subscription to ScienceDirect.
2. Search arXiv or ResearchGate for an open‑access pre‑print.
3. Contact authors for supplementary materials.

**Use in validation:** Enable validation of armor‑penetration models (`intrinsicArmor_J`, `penetrationBias`) against real hypervelocity‑impact data.

---

## 3. U.S. Army Technical Manual TM 5‑855‑1

**What we need:** Blast overpressure vs scaled‑distance formulas for TNT‑equivalent charges, and confinement factors for steel cylinders.

**Document:** *"Fundamentals of Protective Design"* (U.S. Army Corps of Engineers)

**Attempted access:** https://archive.org/details/TM5-855-1 (404)

**Required file:** `TM5-855-1.pdf`

**How to obtain:**
1. Search DTIC (Defense Technical Information Center) for declassified version.
2. Look on engineering‑library portals (globalsecurity.org, scribd).
3. Military‑engineering textbooks may contain excerpts.

**Use in validation:** Provide empirical blast formulas for pressure‑distance curves.

---

## 4. NATO STANAG 4569

**What we need:** Blast‑pressure levels for protection of occupants of logistic and light armored vehicles.

**Document:** NATO Standardization Agreement 4569

**Attempted access:** https://www.sto.nato.int/publications/STANAGs/STANAG4569.pdf (403)

**Required file:** `STANAG4569.pdf`

**How to obtain:**
1. NATO standardization office (restricted distribution).
2. Declassified excerpts on defense‑engineering portals.
3. Secondary sources that quote the blast‑pressure tables.

**Use in validation:** Provide standardized blast‑pressure vs distance curves for military‑relevant scenarios.

---

## 5. NATO STANAG 4526

**What we need:** Ballistic penetration energy thresholds for small‑arms ammunition.

**Document:** NATO Standardization Agreement 4526

**Attempted access:** No direct attempt (likely similarly restricted).

**Required file:** `STANAG4526.pdf` or extracted penetration‑energy tables.

**How to obtain:** Same as STANAG 4569.

**Use in validation:** Already referenced for the "Damage Energy Constants" validation (passed). Could provide additional material‑specific penetration data.

---

## 6. Raw GRF Datasets (Optional)

**What we need:** Time‑series ground‑reaction‑force waveforms for injured vs uninjured runners.

**Sources:**
- Runner Injury GRF Dataset (PubMed 40885827)
- Tibial Stress Injury GRF Dataset (PubMed 40868315)

**Status:** Quantitative summary statistics extracted from articles (§6.1–6.2 of validation inventory). Raw waveform data would enable more detailed validation but is not essential.

**Required files (if available):**
- `runner-injury-grf.csv` – Time‑series GRF (N) and load‑rate (N/s) data.
- `tibial-stress-grf.csv` – Same for tibial‑stress‑injury groups.

**How to obtain:** Contact authors (Nixon et al.) for raw data sharing.

**Use in validation:** Validate simulated impact‑loading waveforms against real runner biomechanics.

---

## 7. One‑Legged Stand Test Raw Data

**What we need:** Already accessible via PhysioNet. Download command:

```bash
wget -r -N -c -np https://physionet.org/files/olst-mocap-forceplate-radar/1.0/
```

**Required files:** Will be downloaded automatically when validation scenario is implemented.

**Status:** Data secured; placeholder validation already passes.

---

## Directory Structure

```
docs/unavailable-resources/
├── README.md                          (this file)
├── confined-blast-pressure-tables.csv (when obtained)
├── confined-blast-formulas.txt        (when obtained)
├── pyblossum-paper.pdf                (when obtained)
├── pyblossum-equations.txt            (when obtained)
├── TM5-855-1.pdf                      (when obtained)
├── STANAG4569.pdf                     (when obtained)
├── STANAG4526.pdf                     (when obtained)
└── (optional GRF raw data files)
```

## Next Steps

1. Save any located files in this directory with the suggested filenames.
2. Update `docs/external-dataset-validation-inventory.md` to reflect newly available resources.
3. Run `npm run run:validation` for the relevant subsystem to integrate the new data.

---

*Last updated: 2026‑03‑17*
*Maintained by Ananke validation framework.*