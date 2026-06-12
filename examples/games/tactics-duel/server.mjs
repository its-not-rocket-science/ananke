import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL("../../..", import.meta.url).pathname);

const mime = new Map([
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".json", "application/json"],
  [".css", "text/css"],
]);

createServer(async (req, res) => {
  const reqPath = req.url === "/" ? "/examples/games/tactics-duel/web/index.html" : req.url;
  const full = path.join(repoRoot, reqPath);
  try {
    const data = await readFile(full);
    res.setHeader("Content-Type", mime.get(path.extname(full)) ?? "text/plain");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(4173, () => {
  console.log("Tactics Duel on http://localhost:4173");
});
