#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const strict = process.argv.includes("--strict");
const checklistFile = fileArg ? fileArg.split("=")[1] : ".github/beta-launch-readiness.json";
const fullPath = path.resolve(checklistFile);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Missing readiness file: ${checklistFile}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));

const failures = [];
const checks = [
  ["technicalReadiness.testMatrixPassed", data.technicalReadiness?.testMatrixPassed === true],
  ["technicalReadiness.determinismFuzzer10000Passed", data.technicalReadiness?.determinismFuzzer10000Passed === true],
  ["technicalReadiness.performanceBudgetPassed", data.technicalReadiness?.performanceBudgetPassed === true],
  ["technicalReadiness.memoryLeakSoak48hPassed", data.technicalReadiness?.memoryLeakSoak48hPassed === true],
  ["technicalReadiness.wasmBackendDeterministic", data.technicalReadiness?.wasmBackendDeterministic === true],

  ["apiStability.tier1ExportsFrozen", data.apiStability?.tier1ExportsFrozen === true],
  ["apiStability.tier1FunctionsHaveJSDocExamples", data.apiStability?.tier1FunctionsHaveJSDocExamples === true],
  ["apiStability.deprecationPolicyDocumented", data.apiStability?.deprecationPolicyDocumented === true],

  ["documentation.learningPathsComplete", data.documentation?.learningPathsComplete === true],
  ["documentation.apiReferenceGeneratedSearchable", data.documentation?.apiReferenceGeneratedSearchable === true],
  ["documentation.videoTutorialPublished", data.documentation?.videoTutorialPublished === true],

  ["adoptionReadiness.externalPrototypeCount>=3", Number(data.adoptionReadiness?.externalPrototypeCount ?? 0) >= 3],
  ["adoptionReadiness.p1BugsLast14Days===0", Number(data.adoptionReadiness?.p1BugsLast14Days ?? -1) === 0],
  ["adoptionReadiness.discordActiveMembers>=10", Number(data.adoptionReadiness?.discordActiveMembers ?? 0) >= 10],

  ["legalGovernance.licenseValidated", data.legalGovernance?.licenseValidated === true],
  ["legalGovernance.claCompleteIfRequired", data.legalGovernance?.claCompleteIfRequired === true],
  ["legalGovernance.securityPolicyPublished", data.legalGovernance?.securityPolicyPublished === true],
];

for (const [name, ok] of checks) {
  if (!ok) failures.push(name);
}

const mustExist = ["LICENSE", "SECURITY.md"];
for (const rel of mustExist) {
  if (!fs.existsSync(path.resolve(rel))) failures.push(`missing-required-file:${rel}`);
}

if (failures.length > 0) {
  if (strict) {
    console.error("❌ Beta launch readiness check failed.");
  } else {
    console.warn("⚠️ Beta launch readiness check has unmet items (non-blocking without --strict).");
  }
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(strict ? 1 : 0);
}

console.log("✅ Beta launch readiness check passed.");
console.log(`Checklist source: ${checklistFile}`);
