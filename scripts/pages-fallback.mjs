/**
 * GitHub Pages has no server router. Promote the SPA shell to index.html and
 * copy it to 404.html so deep links (/room/ABCDE) still load the game.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const clientDir = join(process.cwd(), "dist/client");
const shell = join(clientDir, "_shell.html");
const prerendered = join(clientDir, "index.html");

const source = existsSync(prerendered) && prerendered !== shell ? prerendered : shell;
if (!existsSync(shell) && !existsSync(prerendered)) {
  console.error("[pages] no SPA shell at dist/client/_shell.html");
  process.exit(1);
}

const html = readFileSync(existsSync(shell) ? shell : prerendered, "utf8");
writeFileSync(join(clientDir, "index.html"), html);
copyFileSync(join(clientDir, "index.html"), join(clientDir, "404.html"));
writeFileSync(join(clientDir, ".nojekyll"), "");
console.log(`[pages] wrote index.html, 404.html, .nojekyll in ${clientDir}`);
