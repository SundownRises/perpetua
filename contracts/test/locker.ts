/**
 * PerpetuaLocker against the REAL Mezo testnet VeBTC and VeBTCVoter, on a fork.
 *
 * Run: npx hardhat test test/locker.ts --network mezoFork
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, formatEther, getAddress } from "viem";
import { MEZO_TESTNET, WEEK } from "../addresses.js";
import { installBtcFacade, fundBtc, deployPerpetua, LIVE_TESTNET_GAUGES, type Conn } from "./helpers.js";

const VE_ABI = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "balanceOfNFT", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "locked", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "amount", type: "int128" }, { name: "end", type: "uint256" }, { name: "isPermanent", type: "bool" }] }] },
] as const;

const VOTER_ABI = [
  { type: "function", name: "votes", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "usedWeights", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

describe("PerpetuaLocker (fork of Mezo testnet)", () => {
  let conn: Conn;

  before(async () => {
    conn = await network.connect();
    await installBtcFacade(conn);
  });

  it("opens one permanently-locked position and mints lveBTC 1:1", async () => {
    const { viem } = conn;
    const pub = await viem.getPublicClient();
    const { locker, lveBTC, deployer } = await deployPerpetua(conn);

    await fundBtc(conn, deployer.account.address, parseEther("5"));
    const btc = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);

    const amount = parseEther("2");
    await btc.write.approve([locker.address, amount]);
    await locker.write.deposit([amount, deployer.account.address]);

    const tokenId = await locker.read.tokenId();
    assert.ok(tokenId > 0n, "a veNFT should have been created");

    // The protocol, not the depositor, owns the veNFT.
    const owner = await pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "ownerOf", args: [tokenId] });
    assert.equal(getAddress(owner), getAddress(locker.address));

    assert.equal(await lveBTC.read.balanceOf([deployer.account.address]), amount, "1 lveBTC per 1 BTC");
    assert.equal(await lveBTC.read.totalSupply(), amount);
    assert.equal(await locker.read.totalLocked(), amount);

    const permanent = await locker.read.isPermanent();
    console.log(`  isPermanent=${permanent}  tokenId=${tokenId}  locked=${formatEther(await locker.read.totalLocked())} BTC`);
    assert.equal(permanent, true, "lockPermanent must succeed on Mezo's VeBTC");

    const lock = await pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "locked", args: [tokenId] });
    assert.equal(lock.isPermanent, true, "escrow should agree the lock is permanent");
  });

  it("adds later deposits to the same position", async () => {
    const { viem } = conn;
    const { locker, lveBTC, deployer } = await deployPerpetua(conn);
    const [, , alice] = await viem.getWalletClients();

    await fundBtc(conn, deployer.account.address, parseEther("5"));
    await fundBtc(conn, alice.account.address, parseEther("5"));
    const btc = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);

    await btc.write.approve([locker.address, parseEther("1")]);
    await locker.write.deposit([parseEther("1"), deployer.account.address]);
    const firstId = await locker.read.tokenId();

    // Alice deposits from her own account.
    const btcAsAlice = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc, { client: { wallet: alice } });
    const lockerAsAlice = await viem.getContractAt("PerpetuaLocker", locker.address, { client: { wallet: alice } });
    await btcAsAlice.write.approve([locker.address, parseEther("3")]);
    await lockerAsAlice.write.deposit([parseEther("3"), alice.account.address]);

    assert.equal(await locker.read.tokenId(), firstId, "must keep ONE aggregated position");
    assert.equal(await locker.read.totalLocked(), parseEther("4"));
    assert.equal(await lveBTC.read.balanceOf([alice.account.address]), parseEther("3"));
    assert.equal(await lveBTC.read.totalSupply(), parseEther("4"));
  });

  it("does not decay: voting power is unchanged after 4 weeks", async () => {
    const { viem, networkHelpers } = conn;
    const pub = await viem.getPublicClient();
    const { locker, deployer } = await deployPerpetua(conn);

    await fundBtc(conn, deployer.account.address, parseEther("5"));
    const btc = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);
    await btc.write.approve([locker.address, parseEther("2")]);
    await locker.write.deposit([parseEther("2"), deployer.account.address]);

    const tokenId = await locker.read.tokenId();
    const before = await pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "balanceOfNFT", args: [tokenId] });

    // Four weeks is beyond Mezo's 28-day MAXTIME: an ordinary lock would be worth zero.
    await networkHelpers.time.increase(Number(WEEK * 4n));

    const after = await pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "balanceOfNFT", args: [tokenId] });
    console.log(`  weight before=${formatEther(before)}  after 4 weeks=${formatEther(after)}`);

    assert.equal(before, parseEther("2"), "permanent weight equals the locked amount");
    assert.equal(after, before, "a permanent lock must not decay");
  });

  it("votes the bloc across real MUSD gauges", async () => {
    const { viem } = conn;
    const pub = await viem.getPublicClient();
    const { locker, deployer, operator } = await deployPerpetua(conn);

    await fundBtc(conn, deployer.account.address, parseEther("5"));
    const btc = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);
    await btc.write.approve([locker.address, parseEther("2")]);
    await locker.write.deposit([parseEther("2"), deployer.account.address]);

    const tokenId = await locker.read.tokenId();
    const lockerAsOperator = await viem.getContractAt("PerpetuaLocker", locker.address, { client: { wallet: operator } });

    const pools = [LIVE_TESTNET_GAUGES.musdBtc.pool, LIVE_TESTNET_GAUGES.musdUsdc.pool] as `0x${string}`[];
    await lockerAsOperator.write.vote([pools, [70n, 30n]]);

    const used = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "usedWeights", args: [tokenId] });
    const vote0 = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "votes", args: [tokenId, pools[0]] });
    const vote1 = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "votes", args: [tokenId, pools[1]] });

    console.log(`  usedWeights=${formatEther(used)}  MUSD/BTC=${formatEther(vote0)}  MUSD/mUSDC=${formatEther(vote1)}`);
    assert.ok(used > 0n, "the voter should record weight for our position");
    assert.ok(vote0 > vote1, "70/30 split should favour the first pool");
    assert.ok(vote0 + vote1 <= parseEther("2") + 1n, "cannot vote more than our weight");
  });

  it("rejects vote direction from a non-operator", async () => {
    const { viem } = conn;
    const { locker, deployer } = await deployPerpetua(conn);
    const [, , , mallory] = await viem.getWalletClients();

    await fundBtc(conn, deployer.account.address, parseEther("5"));
    const btc = await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);
    await btc.write.approve([locker.address, parseEther("1")]);
    await locker.write.deposit([parseEther("1"), deployer.account.address]);

    const lockerAsMallory = await viem.getContractAt("PerpetuaLocker", locker.address, { client: { wallet: mallory } });
    await assert.rejects(
      () => lockerAsMallory.write.vote([[LIVE_TESTNET_GAUGES.musdBtc.pool], [100n]]),
      /OnlyOperator|reverted/i,
    );
  });

  it("sweeps harvested tokens to the reward sink", async () => {
    const { viem } = conn;
    const { locker, deployer } = await deployPerpetua(conn);
    const [, , , , sink] = await viem.getWalletClients();

    const reward = await viem.deployContract("MockERC20", ["Mezo USD", "MUSD", 18]);
    await reward.write.mint([locker.address, parseEther("500")]);

    // Sweeping before a sink is configured must fail rather than burn funds.
    await assert.rejects(() => locker.write.sweep([reward.address]), /SinkNotSet|reverted/i);

    await locker.write.setRewardSink([sink.account.address]);
    await locker.write.sweep([reward.address]);

    assert.equal(await reward.read.balanceOf([sink.account.address]), parseEther("500"));
    assert.equal(await reward.read.balanceOf([locker.address]), 0n);
    void deployer;
  });
});
