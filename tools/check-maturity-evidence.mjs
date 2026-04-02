import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const matrixPath = path.join(repoRoot, "docs", "maturity-matrix.json");
const evidenceMapPath = path.join(repoRoot, "docs", "maturity-evidence-map.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mustExist(paths, label, subsystem, errors) {
  for (const relPath of paths) {
    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${subsystem}: missing ${label} -> ${relPath}`);
    }
  }
}

function countEvidence(criteria) {
  return [
    ...(criteria.requiredTests ?? []),
    ...(criteria.requiredFixtures ?? []),
    ...(criteria.requiredInvariants ?? []),
    ...(criteria.requiredCoverageSignals ?? []),
    ...(criteria.requiredValidationArtifacts ?? [])
  ].length;
}

function main() {
  const matrix = readJson(matrixPath);
  const evidenceMap = readJson(evidenceMapPath);

  const maturityBySubsystem = new Map(matrix.subsystems.map((s) => [s.name, s.maturity]));
  const errors = [];

  for (const dimension of evidenceMap.dimensions) {
    const maturity = maturityBySubsystem.get(dimension.subsystem);
    if (!maturity) {
      errors.push(`Unknown subsystem in evidence map: ${dimension.subsystem}`);
      continue;
    }

    if (maturity !== dimension.expectedMaturity) {
      errors.push(
        `${dimension.subsystem}: expected maturity ${dimension.expectedMaturity} in evidence map but matrix has ${maturity}`
      );
    }

    const criteria = dimension.criteria;
    mustExist(criteria.requiredTests ?? [], "test", dimension.subsystem, errors);
    mustExist(criteria.requiredFixtures ?? [], "fixture", dimension.subsystem, errors);
    mustExist(criteria.requiredInvariants ?? [], "invariant test", dimension.subsystem, errors);
    mustExist(criteria.requiredValidationArtifacts ?? [], "validation artifact", dimension.subsystem, errors);

    if ((criteria.requiredTests ?? []).length === 0) {
      errors.push(`${dimension.subsystem}: requires at least one requiredTests entry`);
    }

    if (maturity === "M3" && (criteria.requiredTests ?? []).length < 3) {
      errors.push(`${dimension.subsystem}: M3 requires at least 3 required tests`);
    }

    if (maturity === "M4") {
      const validationCount = (criteria.requiredValidationArtifacts ?? []).length + (criteria.requiredFixtures ?? []).length;
      if (validationCount === 0) {
        errors.push(`${dimension.subsystem}: M4 requires validation artifacts and/or conformance fixtures`);
      }
    }

    if (countEvidence(criteria) < 2) {
      errors.push(`${dimension.subsystem}: evidence criteria are too thin (<2 signals)`);
    }
  }

  for (const subsystem of matrix.subsystems) {
    if (!evidenceMap.dimensions.some((d) => d.subsystem === subsystem.name)) {
      errors.push(`Missing evidence-map entry for matrix subsystem: ${subsystem.name}`);
    }
  }

  if (errors.length > 0) {
    console.error("Maturity evidence check failed:");
    for (const error of errors) {
      console.error(` - ${error}`);
    }
    process.exit(1);
  }

  console.log(`Maturity evidence check passed (${evidenceMap.dimensions.length} dimensions).`);
}

main();
