import {
  applyTeamCommand,
  getWinner,
  loadState,
  newTacticsDuel,
  saveState,
  verifyDeterminism,
} from "../../../../dist/examples/games/tactics-duel/game-core.js";

const grid = document.getElementById("grid");
const status = document.getElementById("status");
const attackButton = document.getElementById("attack");

let state = newTacticsDuel(2026);
let selected = null;

function render() {
  status.textContent = `Turn ${state.turn} · Team ${state.activeTeam}`;
  grid.innerHTML = "";
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      const unit = state.units.find(u => u.gridX === x && u.gridY === y);
      const cell = document.createElement("button");
      cell.className = `cell ${unit ? `t${unit.teamId}` : ""}`;
      cell.textContent = unit ? unit.role[0] : "";
      cell.onclick = () => {
        if (!unit) {
          if (selected) {
            applyTeamCommand(state, { kind: "move", unitId: selected.id, dx: x - selected.gridX, dy: y - selected.gridY });
            selected = null;
            afterAction();
          }
          return;
        }
        if (unit.teamId === state.activeTeam) selected = unit;
      };
      grid.appendChild(cell);
    }
  }
}

function afterAction() {
  const winner = getWinner(state);
  if (winner) {
    status.textContent = `Team ${winner} wins in ${state.turn} turns.`;
  } else {
    render();
  }
}

attackButton.onclick = () => {
  if (!selected) return;
  applyTeamCommand(state, { kind: "attack", unitId: selected.id });
  selected = null;
  afterAction();
};

document.getElementById("save").onclick = () => {
  localStorage.setItem("tactics-duel-save", saveState(state));
  alert("Saved.");
};

document.getElementById("load").onclick = () => {
  const raw = localStorage.getItem("tactics-duel-save");
  if (!raw) return;
  state = loadState(raw);
  render();
};

document.getElementById("replay").onclick = () => {
  const blob = new Blob([saveState(state)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tactics-duel-save-seed-${state.seed}.json`;
  a.click();
};

document.getElementById("check").onclick = () => {
  alert(verifyDeterminism(state) ? "Determinism check passed." : "Determinism check failed.");
};

render();
