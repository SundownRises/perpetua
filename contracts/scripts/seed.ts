/**
 * Puts the deployed protocol into a demo-ready state in one command:
 *
 *   1. deposit BTC            -> opens the permanent position, mints lveBTC
 *   2. vote                   -> allocates the bloc across the live MUSD gauges
 *   3. stake lveBTC           -> so the dashboard shows a staked balance
 *   4. swap BTC -> MUSD       -> via Mezo's Router, through the real MUSD/BTC pool
 *   5. notifyRewardAmount     -> starts a MUSD stream so "Claimable MUSD" ticks up
 *
 * A zeroed dashboard reads as broken on video, so run this before recording.
 *
 *   npx hardhat run scripts/seed.ts --network mezoTestnet
 *
 * Env:
 *   SEED_DEPOSIT   BTC to lock            (default 0.002)
 *   SEED_STAKE_PCT % of lveBTC to stake   (default 100)
 *   SEED_SWAP      BTC to convert to MUSD (default 0.0005)
 */
import { network } from "hardhat";
import { parseEther, formatEther, type Address } from "viem";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MEZO_TESTNET } from "../addresses.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const ERC20 = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const ROUTER = [
  {
    type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "amountIn" },
      { type: "uint256", name: "amountOutMin" },
      { type: "tuple[]", name: "routes", components: [
        { type: "address", name: "from" }, { type: "address", name: "to" },
        { type: "bool", name: "stable" }, { type: "address", name: "factory" },
      ] },
      { type: "address", name: "to" },
      { type: "uint256", name: "deadline" },
    ],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function", name: "getAmountsOut", stateMutability: "view",
    inputs: [
      { type: "uint256", name: "amountIn" },
      { type: "tuple[]", name: "routes", components: [
        { type: "address", name: "from" }, { type: "address", name: "to" },
        { type: "bool", name: "stable" }, { type: "address", name: "factory" },
      ] },
    ],
    outputs: [{ type: "uint256[]" }],
  },
] as const;

/** Live MUSD gauges on Mezo testnet, discovered by test/mezo-integration.ts. */
const MUSD_POOLS: Address[] = [
  "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9", // MUSD/BTC  volatile
  "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e", // MUSD/mUSDC stable
];
const VOTE_WEIGHTS = [60n, 40n];

async function main() {
  const conn = await network.connect();
  const { viem } = conn;
  const pub = await viem.getPublicClient();
  const [signer] = await viem.getWalletClients();
  const me = signer.account.address;

  const depositAmount = parseEther(process.env.SEED_DEPOSIT ?? "0.002");
  const swapAmount = parseEther(process.env.SEED_SWAP ?? "0.0005");
  const stakePct = BigInt(process.env.SEED_STAKE_PCT ?? "100");

  const dep = JSON.parse(
    readFileSync(join(HERE, "..", "..", "deployments", "mezoTestnet.json"), "utf8"),
  ) as { contracts: Record<string, Address> };

  const locker = await viem.getContractAt("PerpetuaLocker", dep.contracts.PerpetuaLocker);
  const lveBTC = await viem.getContractAt("LveBTC", dep.contracts.LveBTC);
  const streamer = await viem.getContractAt("MUSDRewardStreamer", dep.contracts.MUSDRewardStreamer);

  const bal = await pub.getBalance({ address: me });
  console.log(`\nSeeding Perpetua demo state`);
  console.log(`  signer  ${me}`);
  console.log(`  balance ${formatEther(bal)} BTC\n`);
  if (bal < depositAmount + swapAmount) {
    throw new Error(`need at least ${formatEther(depositAmount + swapAmount)} BTC plus gas; have ${formatEther(bal)}`);
  }

  const wait = async (hash: `0x${string}`, label: string) => {
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
    console.log(`      ok  ${hash}`);
  };

  // 1. Deposit -------------------------------------------------------------
  console.log(`[1/5] depositing ${formatEther(depositAmount)} BTC`);
  const allowance = (await pub.readContract({
    address: MEZO_TESTNET.btc, abi: ERC20, functionName: "allowance", args: [me, locker.address],
  })) as bigint;
  if (allowance < depositAmount) {
    await wait(
      await signer.writeContract({
        address: MEZO_TESTNET.btc, abi: ERC20, functionName: "approve",
        args: [locker.address, depositAmount * 100n], chain: null, account: signer.account,
      }),
      "approve BTC",
    );
  }
  await wait(await locker.write.deposit([depositAmount, me]), "deposit");
  const tokenId = await locker.read.tokenId();
  console.log(`      veNFT #${tokenId}  permanent=${await locker.read.isPermanent()}  locked=${formatEther(await locker.read.totalLocked())} BTC`);

  // 2. Vote ----------------------------------------------------------------
  console.log(`\n[2/5] voting ${VOTE_WEIGHTS.join("/")} across the MUSD gauges`);
  await wait(await locker.write.vote([MUSD_POOLS, VOTE_WEIGHTS]), "vote");

  // 3. Stake ---------------------------------------------------------------
  const lveBalance = await lveBTC.read.balanceOf([me]);
  const toStake = (lveBalance * stakePct) / 100n;
  console.log(`\n[3/5] staking ${formatEther(toStake)} lveBTC`);
  if (toStake > 0n) {
    await wait(await lveBTC.write.approve([streamer.address, toStake]), "approve lveBTC");
    await wait(await streamer.write.stake([toStake]), "stake");
  }

  // 4. BTC -> MUSD ---------------------------------------------------------
  console.log(`\n[4/5] swapping ${formatEther(swapAmount)} BTC for MUSD via Mezo Router`);
  const routes = [{
    from: MEZO_TESTNET.btc as Address,
    to: MEZO_TESTNET.musd as Address,
    stable: false,
    factory: MEZO_TESTNET.poolFactory as Address,
  }];
  const quoted = (await pub.readContract({
    address: MEZO_TESTNET.router, abi: ROUTER, functionName: "getAmountsOut", args: [swapAmount, routes],
  })) as bigint[];
  const expected = quoted[quoted.length - 1];
  console.log(`      quote ${formatEther(expected)} MUSD`);
  if (expected === 0n) throw new Error("router quoted zero; the MUSD/BTC pool may have no liquidity");

  await wait(
    await signer.writeContract({
      address: MEZO_TESTNET.btc, abi: ERC20, functionName: "approve",
      args: [MEZO_TESTNET.router, swapAmount], chain: null, account: signer.account,
    }),
    "approve BTC for router",
  );
  const minOut = (expected * 95n) / 100n; // 5% slippage tolerance
  await wait(
    await signer.writeContract({
      address: MEZO_TESTNET.router, abi: ROUTER, functionName: "swapExactTokensForTokens",
      args: [swapAmount, minOut, routes, streamer.address, BigInt(Math.floor(Date.now() / 1000) + 600)],
      chain: null, account: signer.account,
    }),
    "swap",
  );

  // 5. Start the stream ----------------------------------------------------
  const musdInStreamer = (await pub.readContract({
    address: MEZO_TESTNET.musd, abi: ERC20, functionName: "balanceOf", args: [streamer.address],
  })) as bigint;
  const added = await streamer.read.totalRewardsAdded();
  const paid = await streamer.read.totalRewardsPaid();
  const unpromised = musdInStreamer - (added - paid);

  console.log(`\n[5/5] starting a MUSD stream of ${formatEther(unpromised)}`);
  if (unpromised > 0n) {
    await wait(await streamer.write.notifyRewardAmount([unpromised]), "notifyRewardAmount");
  } else {
    console.log(`      nothing unpromised to stream; skipping`);
  }

  console.log(`\nDone. Dashboard state:`);
  console.log(`  total locked      ${formatEther(await locker.read.totalLocked())} BTC`);
  console.log(`  voting power      ${formatEther(await locker.read.votingPower())} veBTC`);
  console.log(`  lveBTC supply     ${formatEther(await lveBTC.read.totalSupply())}`);
  console.log(`  staked            ${formatEther(await streamer.read.totalSupply())}`);
  console.log(`  reward/duration   ${formatEther(await streamer.read.rewardForDuration())} MUSD`);
  console.log(`\n  ${MEZO_TESTNET.explorer}/address/${locker.address}\n`);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
