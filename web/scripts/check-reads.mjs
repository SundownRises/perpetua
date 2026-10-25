/**
 * Exercises the frontend's ACTUAL read path against live Mezo testnet.
 *
 * This exists because a bug slipped through: viem refuses `multicall` unless the
 * chain definition declares a `multicall3` address, so the dashboard failed at
 * runtime with
 *   Chain "Mezo Testnet" does not support contract "multicall3"
 * even though every contract test passed. Contract tests cannot catch a frontend
 * chain-config error; this can.
 *
 *   node scripts/check-reads.mjs [address-to-read-as]
 *
 * Exits non-zero on failure, so it is safe to wire into CI or a pre-push hook.
 */
import { readProtocol, readUser, ADDR, IS_DEPLOYED, fmt, pct } from "../lib/reads.ts";

const account = process.argv[2];
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}

console.log("\nReading live Mezo testnet through the frontend's data layer\n");

check("deployment has real addresses", IS_DEPLOYED, ADDR.locker);
if (!IS_DEPLOYED) {
  console.log("\nNothing deployed; run contracts/scripts/deploy.ts first.\n");
  process.exit(1);
}

// This is the call that was broken. It uses multicall, so it fails loudly if the
// chain definition is missing multicall3.
const p = await readProtocol();

check("multicall succeeded", true);
check("a veNFT exists", p.tokenId > 0n, `tokenId=${p.tokenId}`);
check("the lock is permanent", p.isPermanent === true);
check("BTC is locked", p.totalLocked > 0n, `${fmt(p.totalLocked)} BTC`);
check("voting power is non-zero", p.votingPower > 0n, `${fmt(p.votingPower)} veBTC`);
check(
  "voting power equals locked amount (no decay)",
  p.votingPower === p.totalLocked,
  `${fmt(p.votingPower)} vs ${fmt(p.totalLocked)}`,
);
check("lveBTC supply matches BTC locked", p.lveBtcSupply === p.totalLocked, `${fmt(p.lveBtcSupply)} lveBTC`);
check("gauges were enumerated", p.gauges.length > 0, `${p.gauges.length} gauges`);

const musd = p.gauges.filter((g) => g.isMusd);
check("MUSD gauges found", musd.length > 0, `${musd.length}/${p.gauges.length} are MUSD pairs`);
check("the bloc has voted", p.gauges.some((g) => g.ourVote > 0n));

console.log("\n  gauge allocation:");
for (const g of p.gauges) {
  const share = g.totalWeight > 0n ? pct(g.ourVote, g.totalWeight, 3) : "—";
  console.log(
    `    ${g.label.padEnd(22)} ours=${fmt(g.ourVote, 18, 4).padStart(8)}  total=${fmt(g.totalWeight, 18, 1).padStart(10)}  share=${share}${g.isMusd ? "  [MUSD]" : ""}`,
  );
}

check("a MUSD stream is funded", p.rewardForDuration > 0n, `${fmt(p.rewardForDuration, 18, 2)} MUSD / epoch`);
const streamLive = p.periodFinish > BigInt(Math.floor(Date.now() / 1000));
check("the stream is still active", streamLive, new Date(Number(p.periodFinish) * 1000).toISOString());
check("lveBTC is staked", p.staked > 0n, `${fmt(p.staked)} lveBTC`);

if (account) {
  console.log(`\n  reading as ${account}:`);
  const u = await readUser(account);
  console.log(`    BTC balance    ${fmt(u.btcBalance)}`);
  console.log(`    lveBTC balance ${fmt(u.lveBtcBalance)}`);
  console.log(`    staked         ${fmt(u.stakedBalance)}`);
  console.log(`    earned MUSD    ${fmt(u.earned, 18, 8)}`);
  console.log(`    MUSD balance   ${fmt(u.musdBalance)}`);
  check("user read succeeded", true);
}

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
