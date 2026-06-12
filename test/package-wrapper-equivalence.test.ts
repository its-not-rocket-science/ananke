import { execFileSync } from "node:child_process";

import { describe, expect, test } from "vitest";

interface WrapperSpec {
  name: string;
  wrapperModule: string;
  monolithModules: string[];
  symbols: string[];
  probe: {
    symbol: string;
    args: unknown[];
  };
}

interface WrapperReport {
  name: string;
  wrapperModule: string;
  monolithModules: string[];
  missingSymbols: string[];
  symbolTypeMismatches: Array<{ symbol: string; wrapperType: string; monolithType: string }>;
  probe: {
    symbol: string;
    args: unknown[];
    output: unknown;
  };
}

const WRAPPER_SPECS: WrapperSpec[] = [
  {
    name: "core",
    wrapperModule: "@ananke/core",
    monolithModules: ["@its-not-rocket-science/ananke"],
    symbols: ["q", "to", "createWorld", "stepWorld"],
    probe: {
      symbol: "q",
      args: [1.234],
    },
  },
  {
    name: "combat",
    wrapperModule: "@ananke/combat",
    monolithModules: ["@its-not-rocket-science/ananke/combat"],
    symbols: ["energyAtRange_J", "adjustedDispersionQ", "groupingRadius_m", "adjustConeRange"],
    probe: {
      symbol: "energyAtRange_J",
      args: [1200, 7, 100],
    },
  },
  {
    name: "campaign",
    wrapperModule: "@ananke/campaign",
    monolithModules: ["@its-not-rocket-science/ananke/calendar"],
    symbols: ["createCalendar", "stepCalendar", "computeSeason", "isInHarvestWindow"],
    probe: {
      symbol: "createCalendar",
      args: [2, 400],
    },
  },
  {
    name: "content",
    wrapperModule: "@ananke/content",
    monolithModules: ["@its-not-rocket-science/ananke/species"],
    symbols: ["generateSpeciesIndividual", "ELF_SPECIES", "ALL_SPECIES"],
    probe: {
      symbol: "generateSpeciesIndividual",
      args: ["ELF_SPECIES", 1337],
    },
  },
];

function gatherWrapperReports(specs: WrapperSpec[]): WrapperReport[] {
  const script = `
    const specs = JSON.parse(process.argv[1]);

    const importMerged = async (ids) => Object.assign({}, ...(await Promise.all(ids.map((id) => import(id)))));

    const reports = [];
    for (const spec of specs) {
      const wrapper = await import(spec.wrapperModule);
      const monolith = await importMerged(spec.monolithModules);

      const missingSymbols = spec.symbols.filter(
        (symbol) => !(symbol in wrapper) || !(symbol in monolith),
      );

      const symbolTypeMismatches = spec.symbols
        .filter((symbol) => symbol in wrapper && symbol in monolith)
        .map((symbol) => ({
          symbol,
          wrapperType: typeof wrapper[symbol],
          monolithType: typeof monolith[symbol],
        }))
        .filter(({ wrapperType, monolithType }) => wrapperType !== monolithType);

      const symbol = spec.probe.symbol;
      const wrapperFn = wrapper[symbol];
      const monolithFn = monolith[symbol];
      let args = [...spec.probe.args];
      if (spec.name === "content") {
        const speciesExportName = args[0];
        args[0] = wrapper[speciesExportName];
      }

      const wrapperOutput = wrapperFn(...args);
      const monolithOutput = monolithFn(...args);

      if (JSON.stringify(wrapperOutput) !== JSON.stringify(monolithOutput)) {
        throw new Error(
          \`Probe mismatch for \${spec.name}::\${symbol}\`
        );
      }

      const snapshotOutput = spec.name === "content"
        ? {
            attributeKeys: Object.keys(wrapperOutput.attributes ?? {}).length,
            innateTraits: wrapperOutput.innateTraits?.length ?? 0,
            innateCapabilities: wrapperOutput.innateCapabilities?.length ?? 0,
            naturalWeapons: wrapperOutput.naturalWeapons?.length ?? 0,
            bodyPlanId: wrapperOutput.bodyPlan?.id ?? null,
          }
        : wrapperOutput;

      reports.push({
        name: spec.name,
        wrapperModule: spec.wrapperModule,
        monolithModules: spec.monolithModules,
        missingSymbols,
        symbolTypeMismatches,
        probe: {
          symbol,
          args,
          output: snapshotOutput,
        },
      });
    }

    process.stdout.write(JSON.stringify(reports));
  `;

  const stdout = execFileSync("node", ["--input-type=module", "-e", script, JSON.stringify(specs)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout) as WrapperReport[];
}

describe("workspace package wrappers are equivalent to monolith exports", () => {
  test("wrappers preserve selected monolith symbols and callable shapes", () => {
    const reports = gatherWrapperReports(WRAPPER_SPECS);

    for (const report of reports) {
      expect(report.missingSymbols, `${report.name} missing symbols`).toEqual([]);
      expect(report.symbolTypeMismatches, `${report.name} symbol type mismatches`).toEqual([]);
    }
  });

  test("probe output snapshots match monolith behavior", () => {
    const reports = gatherWrapperReports(WRAPPER_SPECS);

    expect(
      reports.map((report) => ({
        name: report.name,
        wrapperModule: report.wrapperModule,
        monolithModules: report.monolithModules,
        probe: report.probe,
      })),
    ).toMatchSnapshot();
  });
});
