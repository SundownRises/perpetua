# Perpetua — pitch deck

> Source for the submitted deck. Eight slides. Each `##` is one slide; the bullets
> are what goes on it, and the *Say* line is the spoken track.

---

## 1 · Perpetua

**Liquid veBTC with a MUSD coupon.**

Deposit BTC once. Get a token that never decays and pays you in MUSD.

`Mezo Buildathon · Wave 1 · Tracks 1 + 2 · live on Mezo testnet`

> *Say:* Perpetua turns Mezo's voting power into a liquid token that pays a dollar coupon.

---

## 2 · veBTC is a wasting asset

| Friction | Consequence |
|---|---|
| Max lock **28 days** | Re-lock monthly or the position dies |
| Weight **decays to zero** | Voting power bleeds away |
| Boost must be **poked** | Forget, and your multiplier lags |
| Fees claimed **per epoch** | Unclaimed rewards are forfeited |
| 5x boost needs lots of **veMEZO** | Small holders can't reach it |
| A lock is an **NFT** | Illiquid, unusable as collateral |

**Today veBTC rewards large, active, sophisticated holders — and quietly penalises everyone else.**

> *Say:* Mezo's vote-escrow system works, but holding veBTC directly is a part-time job, and the
> rewards scale with how much attention you can pay it. That's capital that should be securing MUSD
> liquidity sitting idle instead.

---

## 3 · One deposit, and the upkeep disappears

```
  you ──BTC──▶  PerpetuaLocker ──────────────▶  one veBTC NFT, locked permanently
  you ◀lveBTC─  (votes the bloc, harvests)        │
                                                  ▼
                MUSDRewardStreamer ◀──── fees + incentives + chain fees
  you ─lveBTC─▶ (swaps to MUSD, streams 7 days)
  you ◀─MUSD──
```

- **No decay** — the position is permanent
- **No upkeep** — no re-locking, poking, or weekly claims
- **Liquid** — `lveBTC` is a plain ERC-20, composable as collateral
- **Scale** — small deposits join a bloc big enough to matter in gauge votes

> *Say:* You deposit BTC and receive lveBTC. Perpetua holds one permanently-locked position, votes it
> as a bloc, harvests what that vote earns, and streams it back as MUSD.

---

## 4 · Three layers of MUSD integration

1. **Yield is denominated in MUSD** — every harvest is converted on-chain through Mezo's Router and
   streamed to stakers. lveBTC is a BTC position paying a dollar coupon.
2. **The fees captured *are* MUSD fees** — **3 of the 4 live gauges on Mezo testnet are MUSD pairs**
   (MUSD/BTC, MUSD/mUSDC, MUSD/mT). Voting fee revenue *is* MUSD trading revenue.
3. **It directs MEZO emissions** — `VeBTCVoter.vote` steers weekly MEZO emissions, and Perpetua
   points a growing bloc of that power at MUSD liquidity.

*Layer 2 is asserted by a test that fails if it stops being true.*

> *Say:* This isn't a token logo on a landing page. MUSD is the unit of account for the entire
> protocol's yield, and the revenue being captured is MUSD trading revenue.

---

## 5 · It works, against the real contracts

Tests run on a **fork of live Mezo testnet** — real `VeBTC`, real `VeBTCVoter`, real `Router`, real
gauges. Not mocks.

| Claim | Evidence |
|---|---|
| `lockPermanent` works on Mezo | veNFT minted, escrow reports `isPermanent = true` |
| **No decay** | Voting power identical after **4 weeks** — past the 28-day MAXTIME where an ordinary lock is worthless |
| Votes land correctly | 70/30 split reads back as 1.4 / 0.6 via `VeBTCVoter.votes` |
| One aggregated position | Later deposits call `increaseAmount`, never a second NFT |
| Access control | Non-operators cannot direct votes |
| Solvency | Streamer refuses to promise MUSD it doesn't hold |

`13 tests passing`

> *Say:* The headline claim is slide 2's problem actually being solved — voting power unchanged after
> four weeks, measured against Mezo's own deployed escrow.

---

## 6 · Live on Mezo testnet

- One-screen dashboard: deposit → stake → claim
- Hero figure: total BTC locked forever
- Live gauge table read straight from `VeBTCVoter`
- One-click **add Mezo testnet** to a wallet that has never seen it
- No backend, no indexer — all state via one viem multicall

`[ screenshot of the dashboard ]`

`[ contract addresses + explorer links ]`

> *Say:* Everything on this screen is read live from chain. The gauge table is Mezo's real voter
> state, not a fixture.

---

## 7 · Deliberate limits, and what's next

**Stated plainly, because a judge will find them anyway:**

- Deposits are **irreversible** — permanent lock, so no redemption. Exit by selling, like `cvxCRV`.
- Voting and harvesting are **operator-gated** in Wave 1.
- **Unaudited, on testnet by choice** — permanently locking real BTC behind unaudited contracts would
  be irresponsible, and the rules accept testnet.

**Wave 2 — the piece that makes this more than a yield wrapper:**

- **`MUSDVoteMarket`** — anyone pays **MUSD** to bid for the bloc's votes, cleared per epoch,
  proceeds to stakers. **Makes MUSD the unit of account for the price of a Mezo gauge vote.**
- Replace the operator with an on-chain **MUSD-per-vote optimiser**
- **veMEZO boost** toward the 5x multiplier (self-boost or via Matchbox)
- **A real exit** — seed an `lveBTC`/BTC pool, gauge it via permissionless `createPoolGauge`
- Invariant/fuzz tests, a Goldsky subgraph, written security review

> *Say:* Wave 1 is the liquid locker. Wave 2 is the vote market on top of it — that's where MUSD
> becomes the price of influence on Mezo.

---

## 8 · Why this, why now

- **Nobody else is building it.** Zero of the 48 Wave 1 submissions is a liquid locker or staking
  derivative — while "staking derivatives for MUSD/MEZO" is an explicit Mezo ask.
- **It's what the rubric rewards.** Judging favours projects that plug into "lending markets, DEXs,
  **vote-escrow systems**" over isolated consumer apps. This is vote-escrow infrastructure.
- **Every new deposit deepens MUSD liquidity**, because the bloc's votes point there.
- **It's a lego, not an app.** `lveBTC` is a new composable primitive other Mezo protocols can build
  on from day one.

**Repo:** https://github.com/SundownRises/perpetua · **Live:** https://perpetua-chi.vercel.app · MIT

> *Say:* Perpetua makes Mezo's voting power liquid, and makes MUSD the thing that voting power pays
> out in. Thanks — happy to dig into the contracts.
