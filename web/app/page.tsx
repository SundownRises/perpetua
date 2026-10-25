"use client";

import { useState } from "react";
import { parseEther, type Abi, type Address } from "viem";
import { useWallet, publicClient, friendly } from "@/lib/useWallet";
import {
  ADDR, EXPLORER, IS_DEPLOYED, useProtocol, fmt, pct, musdPerLveBtcPerYear,
} from "@/lib/protocol";
import { perpetuaLockerAbi, lveBtcAbi, streamerAbi, erc20Abi } from "@/lib/abi";
import { Card, CardTitle, Stat, Badge, Button, Field, Notice, Row } from "@/components/ui";

const MAX_UINT = (1n << 256n) - 1n;

export default function Page() {
  const w = useWallet();
  const { protocol, user, loading, err, refresh } = useProtocol(w.address);

  const [depositAmount, setDepositAmount] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const ready = w.address && w.onMezo && IS_DEPLOYED;

  /** Sends a write, waits for the receipt, then refreshes on-chain state. */
  async function send(key: string, address: Address, abi: Abi, functionName: string, args: unknown[]) {
    if (!w.walletClient || !w.address) return;
    setBusy(key);
    setTxError(null);
    setLastTx(null);
    try {
      const hash = await w.walletClient.writeContract({
        address, abi, functionName, args,
        account: w.address,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted on chain.");
      setLastTx(hash);
      await refresh();
    } catch (e) {
      setTxError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  const depositWei = (() => {
    try { return depositAmount ? parseEther(depositAmount) : 0n; } catch { return 0n; }
  })();
  const stakeWei = (() => {
    try { return stakeAmount ? parseEther(stakeAmount) : 0n; } catch { return 0n; }
  })();

  const needsBtcApproval = !!user && depositWei > 0n && user.btcAllowance < depositWei;
  const needsLveApproval = !!user && stakeWei > 0n && user.lveBtcAllowance < stakeWei;

  const yearly = protocol ? musdPerLveBtcPerYear(protocol.rewardForDuration, protocol.staked) : 0n;
  const streamLive = protocol ? protocol.periodFinish > BigInt(Math.floor(Date.now() / 1000)) : false;

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      {/* ------------------------------------------------------------- header */}
      <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="h-6 w-6 rounded-md bg-btc" />
            <h1 className="text-xl font-semibold tracking-tight">Perpetua</h1>
            <Badge tone="neutral">Mezo testnet</Badge>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-secondary">
            Liquid veBTC that pays a MUSD coupon. Deposit BTC once; Perpetua holds a
            permanently-locked veBTC position, votes it as a bloc on Mezo&apos;s MUSD gauges, and
            streams the fees back to you in MUSD.
          </p>
        </div>

        <div className="min-w-56">
          {!w.hasProvider ? (
            <Notice tone="info">
              No browser wallet detected. Install MetaMask, then reload.
            </Notice>
          ) : !w.address ? (
            <Button onClick={() => void w.connect()} busy={w.connecting}>
              Connect wallet
            </Button>
          ) : !w.onMezo ? (
            <div className="space-y-2">
              <Notice tone="error">Wrong network (chain {w.chainId ?? "?"}).</Notice>
              <Button onClick={() => void w.switchToMezo()} variant="secondary">
                Switch to Mezo testnet
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-right">
              <div className="text-xs text-ink-muted">Connected</div>
              <div className="tnum text-sm">{w.address.slice(0, 6)}…{w.address.slice(-4)}</div>
              <div className="tnum mt-0.5 text-xs text-ink-secondary">
                {fmt(user?.btcBalance)} BTC · {fmt(user?.musdBalance)} MUSD
              </div>
            </div>
          )}
          {w.error ? <div className="mt-2"><Notice tone="error">{w.error}</Notice></div> : null}
        </div>
      </header>

      {!IS_DEPLOYED ? (
        <Notice tone="error">
          Contracts are not deployed yet. Run{" "}
          <code className="text-ink">npx hardhat run scripts/deploy.ts --network mezoTestnet</code>{" "}
          from <code className="text-ink">contracts/</code>, which rewrites{" "}
          <code className="text-ink">web/lib/deployment.json</code>.
        </Notice>
      ) : null}

      {err ? <div className="mb-6"><Notice tone="error">Could not read chain state: {err}</Notice></div> : null}

      {/* -------------------------------------------- hero + KPI stat tiles */}
      <section className="mb-8">
        <div className="rounded-xl border border-border bg-surface-1 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs text-ink-secondary">Total BTC locked forever</div>
              {/* The one hero figure on the page. */}
              <div className="mt-1 text-5xl font-semibold leading-none text-btc">
                {loading ? "—" : fmt(protocol?.totalLocked, 18, 4)}
                <span className="ml-2 align-baseline text-base font-medium text-ink-muted">BTC</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {protocol?.isPermanent ? (
                <Badge tone="good">Permanent lock — no decay</Badge>
              ) : protocol?.tokenId ? (
                <Badge tone="warning">Decaying lock — needs extending</Badge>
              ) : (
                <Badge tone="neutral">No position yet</Badge>
              )}
              {protocol?.tokenId ? (
                <a
                  className="text-xs text-ink-muted underline decoration-dotted hover:text-ink"
                  href={`${EXPLORER}/token/${ADDR.veBTC}/instance/${protocol.tokenId}`}
                  target="_blank" rel="noreferrer"
                >
                  veNFT #{protocol.tokenId.toString()}
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Bloc voting power"
              value={loading ? "—" : fmt(protocol?.votingPower, 18, 3)}
              unit="veBTC"
              sub="Does not decay"
            />
            <Stat
              label="lveBTC in circulation"
              value={loading ? "—" : fmt(protocol?.lveBtcSupply, 18, 3)}
              unit="lveBTC"
              sub="1 lveBTC = 1 BTC deposited"
            />
            <Stat
              label="lveBTC staked for yield"
              value={loading ? "—" : fmt(protocol?.staked, 18, 3)}
              unit="lveBTC"
              sub={
                protocol && protocol.lveBtcSupply > 0n
                  ? `${pct(protocol.staked, protocol.lveBtcSupply)} of supply`
                  : undefined
              }
              accent="musd"
            />
            <Stat
              label="Current yield rate"
              value={loading ? "—" : fmt(yearly, 18, 2)}
              unit="MUSD / lveBTC / yr"
              sub={streamLive ? "Stream active" : "No active stream"}
              accent="musd"
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            The yield rate is shown as MUSD per lveBTC per year rather than an APR. The numerator is
            MUSD and the denominator is BTC-denominated, so collapsing them into one percentage would
            imply a BTC/USD price this page does not fetch.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ action cards */}
      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        {/* Deposit */}
        <Card>
          <CardTitle hint="irreversible">1 · Deposit BTC</CardTitle>
          <div className="space-y-3">
            <Field
              label="Amount to lock forever"
              unit="BTC"
              value={depositAmount}
              onChange={setDepositAmount}
              max={fmt(user?.btcBalance)}
              onMax={() => user && setDepositAmount(fmt(user.btcBalance, 18, 18))}
              disabled={!ready}
            />
            {needsBtcApproval ? (
              <Button
                busy={busy === "approveBtc"}
                disabled={!ready}
                onClick={() => void send("approveBtc", ADDR.btc, erc20Abi as unknown as Abi, "approve", [ADDR.locker, MAX_UINT])}
              >
                Approve BTC
              </Button>
            ) : (
              <Button
                busy={busy === "deposit"}
                disabled={!ready || depositWei === 0n || (user ? depositWei > user.btcBalance : true)}
                onClick={() => void send("deposit", ADDR.locker, perpetuaLockerAbi as unknown as Abi, "deposit", [depositWei, w.address])}
              >
                Deposit and mint lveBTC
              </Button>
            )}
            <Notice tone="info">
              Deposits can never be withdrawn. The veBTC position is permanent, so there is no
              redemption path — you exit by selling lveBTC. You receive 1 lveBTC per BTC.
            </Notice>
          </div>
        </Card>

        {/* Stake + claim */}
        <Card>
          <CardTitle hint="MUSD rewards">2 · Stake lveBTC, earn MUSD</CardTitle>
          <div className="space-y-3">
            <Field
              label="Amount to stake"
              unit="lveBTC"
              value={stakeAmount}
              onChange={setStakeAmount}
              max={fmt(user?.lveBtcBalance)}
              onMax={() => user && setStakeAmount(fmt(user.lveBtcBalance, 18, 18))}
              disabled={!ready}
            />
            {needsLveApproval ? (
              <Button
                variant="secondary"
                busy={busy === "approveLve"}
                disabled={!ready}
                onClick={() => void send("approveLve", ADDR.lveBTC, lveBtcAbi as unknown as Abi, "approve", [ADDR.streamer, MAX_UINT])}
              >
                Approve lveBTC
              </Button>
            ) : (
              <Button
                variant="secondary"
                busy={busy === "stake"}
                disabled={!ready || stakeWei === 0n || (user ? stakeWei > user.lveBtcBalance : true)}
                onClick={() => void send("stake", ADDR.streamer, streamerAbi as unknown as Abi, "stake", [stakeWei])}
              >
                Stake
              </Button>
            )}

            <div className="border-t border-border pt-3">
              <Row label="Your staked lveBTC">{fmt(user?.stakedBalance)}</Row>
              <Row label="Claimable MUSD">
                <span className="text-musd">{fmt(user?.earned, 18, 6)}</span>
              </Row>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  busy={busy === "claim"}
                  disabled={!ready || !user || user.earned === 0n}
                  onClick={() => void send("claim", ADDR.streamer, streamerAbi as unknown as Abi, "getReward", [])}
                >
                  Claim MUSD
                </Button>
                <Button
                  variant="secondary"
                  busy={busy === "exit"}
                  disabled={!ready || !user || user.stakedBalance === 0n}
                  onClick={() => void send("exit", ADDR.streamer, streamerAbi as unknown as Abi, "exit", [])}
                >
                  Unstake all
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {txError ? <div className="mb-6"><Notice tone="error">{txError}</Notice></div> : null}
      {lastTx ? (
        <div className="mb-6">
          <Notice tone="good">
            Confirmed.{" "}
            <a className="underline" href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          </Notice>
        </div>
      ) : null}

      {/* ------------------------------------------------------- vote panel */}
      <Card className="mb-8">
        <CardTitle hint="read-only in this release">Where the bloc votes</CardTitle>
        {!protocol || protocol.gauges.length === 0 ? (
          <p className="text-sm text-ink-secondary">No gauges found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-secondary">
                  <th className="pb-2 font-medium">Gauge</th>
                  <th className="pb-2 text-right font-medium">Our vote</th>
                  <th className="pb-2 text-right font-medium">Total weight</th>
                  <th className="pb-2 text-right font-medium">Our share</th>
                </tr>
              </thead>
              <tbody>
                {protocol.gauges.map((g) => (
                  <tr key={g.pool} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{g.label}</span>
                        {g.isMusd ? (
                          <span className="rounded border border-musd/40 px-1.5 py-0.5 text-[10px] text-musd">
                            MUSD
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="tnum py-2.5 text-right">{fmt(g.ourVote, 18, 3)}</td>
                    <td className="tnum py-2.5 text-right text-ink-secondary">{fmt(g.totalWeight, 18, 1)}</td>
                    <td className="tnum py-2.5 text-right text-ink-secondary">
                      {g.totalWeight > 0n ? pct(g.ourVote, g.totalWeight, 2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          Vote direction is operator-controlled in this release, and the gauges above are read live
          from Mezo&apos;s VeBTCVoter. Opening this up — so anyone can pay MUSD to bid for the
          bloc&apos;s voting power — is the next milestone.
        </p>
      </Card>

      {/* ----------------------------------------------------------- footer */}
      <footer className="space-y-3 border-t border-border pt-6 text-xs text-ink-muted">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["PerpetuaLocker", ADDR.locker],
            ["lveBTC", ADDR.lveBTC],
            ["MUSDRewardStreamer", ADDR.streamer],
            ["Mezo VeBTC", ADDR.veBTC],
            ["Mezo VeBTCVoter", ADDR.voter],
            ["MUSD", ADDR.musd],
          ].map(([label, addr]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span>{label}</span>
              <a
                className="tnum underline decoration-dotted hover:text-ink"
                href={`${EXPLORER}/address/${addr}`}
                target="_blank" rel="noreferrer"
              >
                {String(addr).slice(0, 6)}…{String(addr).slice(-4)}
              </a>
            </div>
          ))}
        </div>
        <p className="leading-relaxed">
          Unaudited software on Mezo testnet. Deposits are irreversible by design. Built for the Mezo
          Buildathon.
        </p>
      </footer>
    </main>
  );
}
