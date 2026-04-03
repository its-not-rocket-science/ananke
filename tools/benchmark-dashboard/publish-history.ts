import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const latestRaw = readFileSync("benchmarks/results/latest.json", "utf8");
const latest = JSON.parse(latestRaw) as { commit: string; generatedAt: string };
const day = latest.generatedAt.slice(0, 10);

mkdirSync("benchmarks/history", { recursive: true });
copyFileSync("benchmarks/results/latest.json", `benchmarks/history/${day}-${latest.commit.slice(0, 7)}.json`);
writeFileSync("benchmarks/history/latest.json", latestRaw);
console.log("Benchmark history updated.");
