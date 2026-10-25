/**
 * MUSDRewardStreamer unit tests. No Mezo state needed, so these run on a plain
 * in-memory chain.
 *
 * Run: npx hardhat test test/streamer.ts --network local
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther } from "viem";

const DAY = 86400;
const WEEK = 7 * DAY;

/** Allows a small rounding tolerance: rewardRate truncates on integer division. */
function assertClose(actual: bigint, expected: bigint, tolerance: bigint, label: string) {
  const diff = actual > expected ? actual - expected : expected - actual;
  assert.ok(diff <= tolerance, `${label}: expected ~${expected}, got ${actual} (diff ${diff})`);
}

describe("MUSDRewardStreamer", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  async function setup() {
    const conn = await network.connect();
    const { viem, networkHelpers } = conn;
    const [owner, operator, alice, bob] = await viem.getWalletClients();

    const lveBTC = await viem.deployContract("MockERC20", ["Liquid veBTC", "lveBTC", 18]);
    const musd = await viem.deployContract("MockERC20", ["Mezo USD", "MUSD", 18]);

    // The Router is never called in these tests; any non-zero address will do.
    const streamer = await viem.deployContract("MUSDRewardStreamer", [
      lveBTC.address,
      musd.address,
      "0x000000000000000000000000000000000000dEaD",
      owner.account.address,
      operator.account.address,
    ]);

    for (const who of [alice, bob]) {
      await lveBTC.write.mint([who.account.address, parseEther("1000")]);
    }

    const as = async (w: typeof alice, addr: `0x${string}`, name: string) =>
      viem.getContractAt(name, addr, { client: { wallet: w } });

    return { conn, viem, networkHelpers, owner, operator, alice, bob, lveBTC, musd, streamer, as };
  }

  beforeEach(async () => {
    ctx = await setup();
  });

  it("splits a reward stream pro-rata between stakers", async () => {
    const { viem, networkHelpers, operator, alice, bob, lveBTC, musd, streamer } = ctx;

    // Alice stakes 300, Bob 100 -> 75% / 25%.
    for (const [who, amt] of [[alice, parseEther("300")], [bob, parseEther("100")]] as const) {
      const token = await viem.getContractAt("MockERC20", lveBTC.address, { client: { wallet: who } });
      const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: who } });
      await token.write.approve([streamer.address, amt]);
      await s.write.stake([amt]);
    }
    assert.equal(await streamer.read.totalSupply(), parseEther("400"));

    // Fund and start a 7-day stream of 700 MUSD.
    await musd.write.mint([streamer.address, parseEther("700")]);
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });
    await s.write.notifyRewardAmount([parseEther("700")]);

    await networkHelpers.time.increase(WEEK);

    const aliceEarned = await streamer.read.earned([alice.account.address]);
    const bobEarned = await streamer.read.earned([bob.account.address]);

    assertClose(aliceEarned, parseEther("525"), parseEther("0.01"), "alice 75%");
    assertClose(bobEarned, parseEther("175"), parseEther("0.01"), "bob 25%");

    // And they can actually withdraw it.
    const aliceStreamer = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await aliceStreamer.write.getReward();
    assertClose(await musd.read.balanceOf([alice.account.address]), parseEther("525"), parseEther("0.01"), "alice paid");
  });

  it("streams linearly rather than paying out instantly", async () => {
    const { viem, networkHelpers, operator, alice, lveBTC, musd, streamer } = ctx;

    const token = await viem.getContractAt("MockERC20", lveBTC.address, { client: { wallet: alice } });
    const sAlice = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await token.write.approve([streamer.address, parseEther("100")]);
    await sAlice.write.stake([parseEther("100")]);

    await musd.write.mint([streamer.address, parseEther("700")]);
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });
    await s.write.notifyRewardAmount([parseEther("700")]);

    await networkHelpers.time.increase(DAY);
    const afterOneDay = await streamer.read.earned([alice.account.address]);
    assertClose(afterOneDay, parseEther("100"), parseEther("0.5"), "1/7th after one day");

    await networkHelpers.time.increase(6 * DAY);
    const afterWeek = await streamer.read.earned([alice.account.address]);
    assertClose(afterWeek, parseEther("700"), parseEther("0.5"), "all of it after a week");

    // Past the end of the period nothing further accrues.
    await networkHelpers.time.increase(WEEK);
    assertClose(await streamer.read.earned([alice.account.address]), afterWeek, parseEther("0.001"), "no accrual past periodFinish");
  });

  it("refuses to promise rewards it does not hold", async () => {
    const { viem, operator, streamer, musd } = ctx;
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });

    // Nothing funded yet.
    await assert.rejects(() => s.write.notifyRewardAmount([parseEther("100")]), /Insolvent|reverted/i);

    // Fund less than promised.
    await musd.write.mint([streamer.address, parseEther("99")]);
    await assert.rejects(() => s.write.notifyRewardAmount([parseEther("100")]), /Insolvent|reverted/i);

    // Exactly enough now works.
    await musd.write.mint([streamer.address, parseEther("1")]);
    await s.write.notifyRewardAmount([parseEther("100")]);
    assert.equal(await streamer.read.totalRewardsAdded(), parseEther("100"));
  });

  it("rolls an unfinished stream's remainder into the next one", async () => {
    const { viem, networkHelpers, operator, alice, lveBTC, musd, streamer } = ctx;

    const token = await viem.getContractAt("MockERC20", lveBTC.address, { client: { wallet: alice } });
    const sAlice = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await token.write.approve([streamer.address, parseEther("100")]);
    await sAlice.write.stake([parseEther("100")]);

    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });
    await musd.write.mint([streamer.address, parseEther("700")]);
    await s.write.notifyRewardAmount([parseEther("700")]);

    // Halfway through, add another 700.
    await networkHelpers.time.increase(Math.floor(WEEK / 2));
    await musd.write.mint([streamer.address, parseEther("700")]);
    await s.write.notifyRewardAmount([parseEther("700")]);

    // Let the new period run out; Alice is the only staker so she gets everything.
    await networkHelpers.time.increase(WEEK + DAY);
    assertClose(await streamer.read.earned([alice.account.address]), parseEther("1400"), parseEther("1"), "nothing lost in the rollover");
  });

  it("only the operator or owner can start a stream", async () => {
    const { viem, alice, streamer, musd } = ctx;
    await musd.write.mint([streamer.address, parseEther("100")]);
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await assert.rejects(() => s.write.notifyRewardAmount([parseEther("100")]), /OnlyOperator|reverted/i);
  });

  it("exit returns principal and rewards together", async () => {
    const { viem, networkHelpers, operator, alice, lveBTC, musd, streamer } = ctx;

    const token = await viem.getContractAt("MockERC20", lveBTC.address, { client: { wallet: alice } });
    const sAlice = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await token.write.approve([streamer.address, parseEther("100")]);
    await sAlice.write.stake([parseEther("100")]);

    await musd.write.mint([streamer.address, parseEther("700")]);
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });
    await s.write.notifyRewardAmount([parseEther("700")]);
    await networkHelpers.time.increase(WEEK);

    await sAlice.write.exit();

    assert.equal(await lveBTC.read.balanceOf([alice.account.address]), parseEther("1000"), "principal returned in full");
    assertClose(await musd.read.balanceOf([alice.account.address]), parseEther("700"), parseEther("0.01"), "rewards paid");
    assert.equal(await streamer.read.balanceOf([alice.account.address]), 0n);
  });

  it("cannot recover staked principal or promised MUSD", async () => {
    const { viem, owner, operator, alice, lveBTC, musd, streamer } = ctx;

    const token = await viem.getContractAt("MockERC20", lveBTC.address, { client: { wallet: alice } });
    const sAlice = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: alice } });
    await token.write.approve([streamer.address, parseEther("100")]);
    await sAlice.write.stake([parseEther("100")]);

    // Staking token is off limits entirely.
    await assert.rejects(
      () => streamer.write.recover([lveBTC.address, owner.account.address, parseEther("1")]),
      /CannotRecoverCoreAsset|reverted/i,
    );

    // MUSD already promised to stakers is off limits.
    await musd.write.mint([streamer.address, parseEther("700")]);
    const s = await viem.getContractAt("MUSDRewardStreamer", streamer.address, { client: { wallet: operator } });
    await s.write.notifyRewardAmount([parseEther("700")]);
    await assert.rejects(
      () => streamer.write.recover([musd.address, owner.account.address, parseEther("1")]),
      /Insolvent|reverted/i,
    );

    // A genuinely stray token can be rescued.
    const stray = await viem.deployContract("MockERC20", ["Stray", "STRAY", 18]);
    await stray.write.mint([streamer.address, parseEther("5")]);
    await streamer.write.recover([stray.address, owner.account.address, parseEther("5")]);
    assert.equal(await stray.read.balanceOf([owner.account.address]), parseEther("5"));
  });
});
