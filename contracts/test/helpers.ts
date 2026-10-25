import { network } from "hardhat";
import { parseEther } from "viem";
import { MEZO_TESTNET } from "../addresses.js";

export type Conn = Awaited<ReturnType<typeof network.connect>>;

type RawProvider = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export function rawProvider(conn: Conn): RawProvider {
  return (conn as unknown as { provider: RawProvider }).provider;
}

/**
 * Makes Mezo's BTC facade executable inside a fork.
 *
 * Mezo's BTC token lives at a fixed address and presents a normal ERC-20
 * interface, but its balances are backed by Cosmos bank-module state hooks inside
 * `mezod`. EDR cannot reproduce those hooks, so every call to it reverts on a fork
 * even though `eth_getCode` returns bytecode identical to the live chain.
 *
 * We therefore inject a plain ERC-20's runtime code at that exact address. Callers
 * see the same interface the real facade exposes, which is all the code under test
 * depends on. Note that `_decimals` is an immutable, so it survives the code copy;
 * `name`/`symbol` live in storage and are not meaningful afterwards, and nothing
 * under test reads them.
 *
 * Everything else on the fork -- VeBTC, VeBTCVoter, Router, the live gauges -- is
 * the real deployed contract.
 */
export async function installBtcFacade(conn: Conn) {
    const { viem } = conn;
  const provider = rawProvider(conn);
  const pub = await viem.getPublicClient();

  const template = await viem.deployContract("MockERC20", ["Bitcoin", "BTC", 18]);
  const runtime = await pub.getCode({ address: template.address });
  if (!runtime) throw new Error("could not read MockERC20 runtime code");

  await provider.request({ method: "hardhat_setCode", params: [MEZO_TESTNET.btc, runtime] });

  return await viem.getContractAt("MockERC20", MEZO_TESTNET.btc);
}

/** Mints mock BTC to `to` and tops up native balance for gas. */
export async function fundBtc(conn: Conn, to: `0x${string}`, amount = parseEther("10")) {
  const btc = await conn.viem.getContractAt("MockERC20", MEZO_TESTNET.btc);
  await btc.write.mint([to, amount]);
  await conn.networkHelpers.setBalance(to, parseEther("100"));
}

/** The MUSD gauges that are live on Mezo testnet, discovered by test/probe.ts. */
export const LIVE_TESTNET_GAUGES = {
  musdBtc: {
    pool: "0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9",
    gauge: "0xeF07B6852f4F877fB3BBD90b8f358Fb3E07D0Cc3",
    fees: "0xbCF0FAF26Dab69050b004eaE5DC817B522d5d813",
    bribe: "0xD57eEA1BD19c483cEa19cc498575D21F512d4735",
  },
  musdUsdc: {
    pool: "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e",
    gauge: "0x57Ebd7aFD11923082454689975Ea592C7Ed219a0",
    fees: "0x4d20a8003F81fDa90275cD3eC3272c26f2831630",
    bribe: "0x7F46db87fb54D1989c797895E147eAE35723915a",
  },
  musdMt: {
    pool: "0x0E6BD7E52e4491320012f8C9E6161cD915BB0D19",
    gauge: "0x0DCFb9d7cc59F5Ac8bdB947963405e14d3CEdB8c",
    fees: "0x41Ee5EE27FA3076088497E72DC6B19fe79088BFa",
    bribe: "0xAa8a371f64F1bc444B5e4cb68b00562cCF0f3796",
  },
} as const;

/** Deploys the full Perpetua stack against the real Mezo contracts on the fork. */
export async function deployPerpetua(conn: Conn) {
  const { viem } = conn;
  const [deployer, operator] = await viem.getWalletClients();

  const locker = await viem.deployContract("PerpetuaLocker", [
    MEZO_TESTNET.veBTC,
    MEZO_TESTNET.veBTCVoter,
    deployer.account.address,
    operator.account.address,
  ]);

  const lveBTCAddress = await locker.read.lveBTC();
  const lveBTC = await viem.getContractAt("LveBTC", lveBTCAddress);

  return { locker, lveBTC, deployer, operator };
}
