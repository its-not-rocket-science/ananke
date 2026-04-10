import { execFileSync } from "node:child_process";

function runExample() {
  const stdout = execFileSync("node", ["dist/examples/guided-first-hour.js"], {
    encoding: "utf8",
  });

  const resultLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("FIRST_HOUR_RESULT "));

  if (!resultLine) {
    throw new Error("Missing FIRST_HOUR_RESULT output marker.");
  }

  const successLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("FIRST_HOUR_SUCCESS "));

  if (successLine !== "FIRST_HOUR_SUCCESS PASS") {
    throw new Error(`Expected FIRST_HOUR_SUCCESS PASS, got: ${successLine ?? "<missing>"}`);
  }

  const payload = JSON.parse(resultLine.slice("FIRST_HOUR_RESULT ".length));

  if (!Array.isArray(payload.entities) || payload.entities.length !== 2) {
    throw new Error("Expected entities array with length 2.");
  }

  if (payload.success !== true) {
    throw new Error("Expected payload.success to be true.");
  }

  if (payload.deterministicReplayMatch !== true) {
    throw new Error("Expected deterministicReplayMatch to be true.");
  }

  if (payload.replayFrames <= 0) {
    throw new Error("Expected replayFrames to be > 0.");
  }

  return payload;
}

const firstRun = runExample();
const secondRun = runExample();

if (JSON.stringify(firstRun) !== JSON.stringify(secondRun)) {
  throw new Error("Example output changed between two identical runs.");
}

console.log("FIRST_HOUR_SMOKE PASS");
console.log(`FIRST_HOUR_SMOKE_RESULT ${JSON.stringify(firstRun)}`);
