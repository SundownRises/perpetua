/**
 * Verifies contracts on Mezo's Blockscout using the standard-JSON-input endpoint.
 *
 * `hardhat verify` fails here for two reasons that are worth recording:
 *   1. Its Sourcify path doesn't know chain 31611 at all.
 *   2. Its Blockscout path posts to the Etherscan-compatible `/api` shim, which on
 *      Mezo answers "Fail - Unable to verify".
 * Blockscout's own v2 endpoint, fed Hardhat's exact standard JSON input, works.
 *
 * The API host is NOT the explorer host:
 *   explorer  https://explorer.test.mezo.org
 *   api       https://api.explorer.test.mezo.org
 *
 *   node scripts/verify-blockscout.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const API = "https://api.explorer.test.mezo.org";

const TARGETS = [
  { name: "PerpetuaLocker", source: "project/contracts/PerpetuaLocker.sol", address: "0x7790053dd08fcde21dd265e6d89f804f5eada73c" },
  { name: "LveBTC", source: "project/contracts/LveBTC.sol", address: "0x42127777c9A321cAE6aCEF77673CE99D8D718d3f" },
  { name: "MUSDRewardStreamer", source: "project/contracts/MUSDRewardStreamer.sol", address: "0xbdc30dbe11c217194f5e8e6847ada72edfe9504d" },
];

/** Picks the build-info whose input contains the given source file. */
function findBuildInfo(sourceName) {
  const dir = join(ROOT, "artifacts", "build-info");
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.includes(".output.")) continue;
    const bi = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (bi.input?.sources?.[sourceName]) return bi;
  }
  throw new Error(`no build-info contains ${sourceName}`);
}

async function alreadyVerified(address) {
  const r = await fetch(`${API}/api/v2/smart-contracts/${address}`);
  if (!r.ok) return false;
  const j = await r.json();
  return Boolean(j.is_verified);
}

async function verify({ name, source, address }) {
  if (await alreadyVerified(address)) {
    console.log(`  ${name.padEnd(20)} already verified`);
    return true;
  }

  const bi = findBuildInfo(source);

  // Blockscout wants the standard JSON input as an uploaded file.
  const form = new FormData();
  form.append("compiler_version", `v${bi.solcLongVersion}`);
  form.append("contract_name", `${source}:${name}`);
  form.append("autodetect_constructor_args", "true");
  form.append("license_type", "mit");
  form.append(
    "files[0]",
    new Blob([JSON.stringify(bi.input)], { type: "application/json" }),
    "standard-input.json",
  );

  const res = await fetch(
    `${API}/api/v2/smart-contracts/${address}/verification/via/standard-input`,
    { method: "POST", body: form },
  );
  const text = await res.text();
  if (!res.ok) {
    console.log(`  ${name.padEnd(20)} submit failed ${res.status}: ${text.slice(0, 200)}`);
    return false;
  }
  console.log(`  ${name.padEnd(20)} submitted (${text.slice(0, 80)})`);

  // Poll for the result.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (await alreadyVerified(address)) {
      console.log(`  ${name.padEnd(20)} VERIFIED`);
      return true;
    }
  }
  console.log(`  ${name.padEnd(20)} still pending after 60s`);
  return false;
}

console.log(`\nVerifying on ${API}\n`);
let ok = 0;
for (const t of TARGETS) {
  try {
    if (await verify(t)) ok++;
  } catch (e) {
    console.log(`  ${t.name.padEnd(20)} error: ${e.message}`);
  }
}
console.log(`\n${ok}/${TARGETS.length} verified`);
for (const t of TARGETS) {
  console.log(`  https://explorer.test.mezo.org/address/${t.address}#code`);
}
console.log();
