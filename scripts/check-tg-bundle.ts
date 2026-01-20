import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "dist", "public");

function runBuild() {
  execSync("npx vite build --manifest", { stdio: "inherit" });
}

async function readManifest() {
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const raw = await readFile(manifestPath, "utf-8");
  return JSON.parse(raw) as Record<string, { file: string; isDynamicEntry?: boolean; imports?: string[] }>;
}

async function main() {
  runBuild();

  const manifest = await readManifest();
  const entry = Object.entries(manifest).find(([key]) => key.includes("pages/tg/v2"));

  if (!entry) {
    console.error("TG v2 chunk not found in manifest.");
    process.exit(1);
  }

  const [, chunk] = entry;
  const chunkPath = path.join(OUT_DIR, chunk.file);
  const chunkContents = await readFile(chunkPath, "utf-8");

  const forbidden = ["recharts", "lightweight-charts"].filter((token) => chunkContents.includes(token));

  if (forbidden.length > 0) {
    console.error(`TG v2 chunk contains forbidden dependencies: ${forbidden.join(", ")}`);
    process.exit(1);
  }

  console.log(`TG v2 bundle OK: ${chunk.file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
