import { CHOICES, resolveCampaignBattle } from "../../../../dist/examples/games/narrative-campaign/campaign-core.js";

document.getElementById("run").onclick = () => {
  const selected = [];
  if (document.getElementById("guard").checked) selected.push(CHOICES[0]);
  if (document.getElementById("brawler").checked) selected.push(CHOICES[1]);
  const result = resolveCampaignBattle(2026, selected);
  document.getElementById("out").textContent = result.combatMarkdown;

  const blob = new Blob([result.combatMarkdown], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "combat-log.md";
  a.click();
};
