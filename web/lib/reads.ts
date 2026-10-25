import { formatUnits, type Address } from "viem";
import { deployment } from "./deployment";
import { perpetuaLockerAbi, lveBtcAbi, streamerAbi, erc20Abi, voterAbi, poolAbi } from "./abi";
import { publicClient } from "./chain";

export const ADDR = {
  locker: deployment.contracts.PerpetuaLocker as Address,
  lveBTC: deployment.contracts.LveBTC as Address,
  streamer: deployment.contracts.MUSDRewardStreamer as Address,
  veBTC: deployment.mezo.veBTC as Address,
  voter: deployment.mezo.veBTCVoter as Address,
  btc: deployment.mezo.btc as Address,
  musd: deployment.mezo.musd as Address,
};

export const EXPLORER = deployment.explorer;
export const ZERO = "0x0000000000000000000000000000000000000000";
/** False until `scripts/deploy.ts` has run and written real addresses. */
export const IS_DEPLOYED = ADDR.locker !== ZERO;

export type Gauge = {
  pool: Address;
  gauge: Address;
  label: string;
  isMusd: boolean;
  /** Weight our bloc has assigned to this gauge. */
  ourVote: bigint;
  /** Total weight across all voters. */
  totalWeight: bigint;
};

export type ProtocolState = {
  totalLocked: bigint;
  votingPower: bigint;
  isPermanent: boolean;
  tokenId: bigint;
  lveBtcSupply: bigint;
  staked: bigint;
  rewardForDuration: bigint;
  periodFinish: bigint;
  gauges: Gauge[];
};

export type UserState = {
  btcBalance: bigint;
  btcAllowance: bigint;
  lveBtcBalance: bigint;
  lveBtcAllowance: bigint;
  stakedBalance: bigint;
  earned: bigint;
  musdBalance: bigint;
};

const SYMBOL_CACHE = new Map<string, string>();

async function symbolOf(token: Address): Promise<string> {
  if (token.toLowerCase() === ADDR.btc.toLowerCase()) return "BTC";
  const hit = SYMBOL_CACHE.get(token.toLowerCase());
  if (hit) return hit;
  try {
    const s = (await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" })) as string;
    SYMBOL_CACHE.set(token.toLowerCase(), s);
    return s;
  } catch {
    return `${token.slice(0, 6)}…`;
  }
}

export async function readProtocol(): Promise<ProtocolState> {
  const [totalLocked, votingPower, isPermanent, tokenId, lveBtcSupply, staked, rewardForDuration, periodFinish] =
    (await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: ADDR.locker, abi: perpetuaLockerAbi, functionName: "totalLocked" },
        { address: ADDR.locker, abi: perpetuaLockerAbi, functionName: "votingPower" },
        { address: ADDR.locker, abi: perpetuaLockerAbi, functionName: "isPermanent" },
        { address: ADDR.locker, abi: perpetuaLockerAbi, functionName: "tokenId" },
        { address: ADDR.lveBTC, abi: lveBtcAbi, functionName: "totalSupply" },
        { address: ADDR.streamer, abi: streamerAbi, functionName: "totalSupply" },
        { address: ADDR.streamer, abi: streamerAbi, functionName: "rewardForDuration" },
        { address: ADDR.streamer, abi: streamerAbi, functionName: "periodFinish" },
      ],
    })) as [bigint, bigint, boolean, bigint, bigint, bigint, bigint, bigint];

  const gauges = await readGauges(tokenId);

  return {
    totalLocked, votingPower, isPermanent, tokenId,
    lveBtcSupply, staked, rewardForDuration, periodFinish, gauges,
  };
}

async function readGauges(tokenId: bigint): Promise<Gauge[]> {
  const count = (await publicClient.readContract({
    address: ADDR.voter, abi: voterAbi, functionName: "length",
  })) as bigint;

  const n = Number(count > 12n ? 12n : count);
  const pools = (await publicClient.multicall({
    allowFailure: false,
    contracts: Array.from({ length: n }, (_, i) => ({
      address: ADDR.voter, abi: voterAbi, functionName: "pools", args: [BigInt(i)],
    })),
  })) as unknown as Address[];

  const out: Gauge[] = [];
  for (const pool of pools) {
    const [gauge, ourVote, totalWeight] = (await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: ADDR.voter, abi: voterAbi, functionName: "gauges", args: [pool] },
        { address: ADDR.voter, abi: voterAbi, functionName: "votes", args: [tokenId, pool] },
        { address: ADDR.voter, abi: voterAbi, functionName: "weights", args: [pool] },
      ],
    })) as [Address, bigint, bigint];

    let label = `${pool.slice(0, 8)}…`;
    let isMusd = false;
    try {
      const [t0, t1, stable] = (await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: pool, abi: poolAbi, functionName: "token0" },
          { address: pool, abi: poolAbi, functionName: "token1" },
          { address: pool, abi: poolAbi, functionName: "stable" },
        ],
      })) as [Address, Address, boolean];
      label = `${await symbolOf(t0)}/${await symbolOf(t1)}${stable ? " ·stable" : ""}`;
      isMusd = [t0, t1].some((t) => t.toLowerCase() === ADDR.musd.toLowerCase());
    } catch {
      /* concentrated-liquidity or non-standard pool; keep the short label */
    }
    out.push({ pool, gauge, label, isMusd, ourVote, totalWeight });
  }
  return out;
}

export async function readUser(account: Address): Promise<UserState> {
  const [btcBalance, btcAllowance, lveBtcBalance, lveBtcAllowance, stakedBalance, earned, musdBalance] =
    (await publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: ADDR.btc, abi: erc20Abi, functionName: "balanceOf", args: [account] },
        { address: ADDR.btc, abi: erc20Abi, functionName: "allowance", args: [account, ADDR.locker] },
        { address: ADDR.lveBTC, abi: lveBtcAbi, functionName: "balanceOf", args: [account] },
        { address: ADDR.lveBTC, abi: lveBtcAbi, functionName: "allowance", args: [account, ADDR.streamer] },
        { address: ADDR.streamer, abi: streamerAbi, functionName: "balanceOf", args: [account] },
        { address: ADDR.streamer, abi: streamerAbi, functionName: "earned", args: [account] },
        { address: ADDR.musd, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      ],
    })) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint];

  return { btcBalance, btcAllowance, lveBtcBalance, lveBtcAllowance, stakedBalance, earned, musdBalance };
}

// ----------------------------------------------------------------- formatting

/** Trims trailing zeros so values read cleanly at display sizes. */
export function fmt(v: bigint | undefined, decimals = 18, maxFrac = 4): string {
  if (v === undefined) return "—";
  const s = formatUnits(v, decimals);
  const [whole, frac = ""] = s.split(".");
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  const grouped = Number(whole).toLocaleString("en-US");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function pct(part: bigint, total: bigint, places = 1): string {
  if (total === 0n) return "0%";
  const bps = (part * 10_000n) / total;
  return `${(Number(bps) / 100).toFixed(places)}%`;
}

/**
 * Annualises the current MUSD stream against the staked lveBTC.
 *
 * Deliberately labelled "MUSD / lveBTC / yr" rather than APR: the numerator is
 * MUSD and the denominator is BTC-denominated, so dividing them would imply a
 * BTC/USD price we do not fetch here. Showing the raw ratio keeps the figure
 * honest.
 */
export function musdPerLveBtcPerYear(rewardForDuration: bigint, staked: bigint, durationSeconds = 604800n): bigint {
  if (staked === 0n) return 0n;
  const perYear = (rewardForDuration * 31_536_000n) / durationSeconds;
  return (perYear * 10n ** 18n) / staked;
}
