/**
 * Facts about live Mezo testnet that Perpetua's design depends on. These assert
 * against the real chain through a fork, so they fail loudly if Mezo changes
 * underneath us.
 *
 * Run: npx hardhat test test/mezo-integration.ts --network mezoFork
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { formatEther, getAddress } from "viem";
import { MEZO_TESTNET } from "../addresses.js";

const VE_ABI = [
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "voter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "supply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const VOTER_ABI = [
  { type: "function", name: "length", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "pools", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "gauges", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "gaugeToFees", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "gaugeToBribe", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isAlive", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;

const POOL_ABI = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "stable", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

describe("Live Mezo testnet integration surface", () => {
  it("VeBTC is wired to BTC and the VeBTCVoter we expect", async () => {
    const { viem } = await network.connect();
    const pub = await viem.getPublicClient();

    const [token, voter, supply] = await Promise.all([
      pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "token" }),
      pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "voter" }),
      pub.readContract({ address: MEZO_TESTNET.veBTC, abi: VE_ABI, functionName: "supply" }),
    ]);

    assert.equal(getAddress(token), getAddress(MEZO_TESTNET.btc));
    assert.equal(getAddress(voter), getAddress(MEZO_TESTNET.veBTCVoter));
    assert.ok(supply > 0n);
    console.log(`  veBTC locks ${formatEther(supply)} BTC and votes through ${voter}`);
  });

  it("the majority of live gauges are MUSD pairs", async () => {
    const { viem } = await network.connect();
    const pub = await viem.getPublicClient();

    const count = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "length" });
    assert.ok(count > 0n, "expected at least one gauge");

    let musdGauges = 0;
    for (let i = 0n; i < count; i++) {
      const pool = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "pools", args: [i] });
      const gauge = await pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "gauges", args: [pool] });
      const [fees, bribe, alive] = await Promise.all([
        pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "gaugeToFees", args: [gauge] }),
        pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "gaugeToBribe", args: [gauge] }),
        pub.readContract({ address: MEZO_TESTNET.veBTCVoter, abi: VOTER_ABI, functionName: "isAlive", args: [gauge] }),
      ]);

      let label = "(not a basic pool)";
      let hasMusd = false;
      try {
        const [t0, t1, stable] = await Promise.all([
          pub.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
          pub.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
          pub.readContract({ address: pool, abi: POOL_ABI, functionName: "stable" }),
        ]);
        const sym = async (t: `0x${string}`) => {
          if (t.toLowerCase() === MEZO_TESTNET.btc.toLowerCase()) return "BTC";
          try { return await pub.readContract({ address: t, abi: ERC20_ABI, functionName: "symbol" }); } catch { return t.slice(0, 8); }
        };
        label = `${await sym(t0)}/${await sym(t1)} ${stable ? "stable" : "volatile"}`;
        hasMusd = [t0, t1].some((t) => t.toLowerCase() === MEZO_TESTNET.musd.toLowerCase());
      } catch { /* CL pool or non-standard */ }

      if (hasMusd) musdGauges++;
      console.log(`  [${i}] ${label}${hasMusd ? "  <- MUSD" : ""}  gauge=${gauge} alive=${alive}`);
      console.log(`       fees=${fees}  bribe=${bribe}`);
    }

    console.log(`  ${musdGauges}/${count} live gauges are MUSD pairs`);
    // This is the core of the thesis: the fees a veBTC bloc captures are MUSD fees.
    assert.ok(musdGauges * 2 > Number(count), "most fee-generating gauges should be MUSD pairs");
  });
});
