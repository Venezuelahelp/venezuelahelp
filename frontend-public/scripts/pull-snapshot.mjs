#!/usr/bin/env node
// Baja el snapshot real de producción para ver datos reales en local.
// Escribe public/snapshot.local.json (gitignoreado) y asegura .env.local
// para que el dev server lo sirva vía VITE_SNAPSHOT_URL.
import { writeFile, readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROD_URL =
  process.env.SNAPSHOT_URL ?? "https://venezuelahelp.click/snapshot.json";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "snapshot.local.json");
const envFile = join(root, ".env.local");
const ENV_LINE = "VITE_SNAPSHOT_URL=/snapshot.local.json";

const res = await fetch(PROD_URL);
if (!res.ok) {
  console.error(`✗ ${PROD_URL} → HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();
const snap = JSON.parse(text); // valida que sea JSON
const total = Object.values(snap.categories ?? {}).reduce(
  (n, arr) => n + arr.length,
  0,
);
await writeFile(dest, text);

let env = "";
try {
  await access(envFile);
  env = await readFile(envFile, "utf8");
} catch {
  /* no existe */
}
if (!env.includes("VITE_SNAPSHOT_URL")) {
  await writeFile(envFile, env ? `${env.trimEnd()}\n${ENV_LINE}\n` : `${ENV_LINE}\n`);
}

console.log(`✓ ${total} ítems → public/snapshot.local.json`);
console.log("  Reinicia el dev server (npm run dev) para verlos.");
