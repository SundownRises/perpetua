# AKINDO submission form — prepared answers

Copy-paste into the Mezo Buildathon form. Fill the `<…>` placeholders once the repo
is pushed and the site is deployed.

---

**Project name**

> Perpetua

**Project category** (3–5 words)

> Liquid locker, vote-escrow, yield

**TL;DR** (one sentence)

> Perpetua turns Mezo's veBTC voting power into a liquid token that never decays and
> pays its holders in MUSD.

**Track**

> Track 1 (DeFi) and Track 2 (Access & Distribution)

**Chain deployed on**

> Mezo testnet (chain ID 31611)

**Project status**

> Entirely new, built during the hackathon.

**Project readiness**

> Testnet deployment

---

**How it works**

> **The problem.** Holding veBTC on Mezo directly is a part-time job. The maximum lock
> is 28 days, voting weight decays linearly to zero, boost has to be manually poked,
> and fees and incentives must be claimed every epoch or they are forfeited. On top of
> that, the 5x boost requires disproportionately more veMEZO than a small holder has,
> and a lock is an NFT, so it is illiquid and cannot be used as collateral anywhere
> else. The result is that veBTC rewards large, active, sophisticated holders and
> quietly penalises everyone else — capital that should be securing MUSD liquidity
> sits idle instead.
>
> **How it functions.** You deposit BTC into `PerpetuaLocker` and receive `lveBTC`, a
> plain ERC-20, one-to-one. The locker holds a single veBTC position, converts it to a
> permanent lock via `lockPermanent`, and routes every later deposit through
> `increaseAmount` so the protocol always votes as one large, non-decaying bloc rather
> than many small decaying NFTs. It casts that bloc's vote through
> `VeBTCVoter.vote`, and claims the resulting trading fees and external incentives
> with `claimFees` and `claimBribes`. Harvested tokens are converted to MUSD on-chain
> through Mezo's Router and streamed to `lveBTC` stakers over one 7-day epoch using a
> Synthetix-style rewards accumulator. One deposit, and all the upkeep disappears.
>
> **How we use and position MUSD.** MUSD is the unit of account for the protocol's
> entire yield, in three independent layers. First, every harvest is converted to MUSD
> and all rewards are paid in MUSD, which makes `lveBTC` a Bitcoin-denominated position
> paying a dollar coupon. Second, the revenue being captured genuinely is MUSD revenue:
> three of the four gauges currently live on Mezo testnet are MUSD pairs (MUSD/BTC,
> MUSD/mUSDC, MUSD/mT), so the trading fees a veBTC vote earns are MUSD trading fees.
> We assert this on-chain in a test that fails if it ever stops being true. Third, the
> vote itself steers weekly MEZO emissions, and Perpetua aims a growing bloc of that
> power at MUSD liquidity. Every new deposit therefore deepens MUSD liquidity.
>
> **Why it is composable rather than a standalone app.** `lveBTC` is a new primitive,
> not a destination. It plugs directly into Mezo's existing vote-escrow system and
> DEX, and other protocols can accept it as collateral or pair it in a pool from day
> one without Perpetua's cooperation.

**Target group**

> Mid-level to senior DeFi users and protocols on Mezo, desktop-first.
>
> Two distinct groups. **BTC holders** who want veBTC's fee revenue without the monthly
> re-locking, the poking, and the per-epoch claiming — and who, below a certain size,
> can never reach the 5x boost on their own. Pooling into a bloc is the only way they
> get meaningful gauge influence. **Protocols and DAOs** that need MUSD liquidity in a
> specific gauge and would rather rent concentrated voting power than accumulate and
> maintain veBTC themselves; that is the Wave 2 MUSD vote market.
>
> This fits both tracks: it is DeFi infrastructure for MUSD/MEZO as productive capital
> (Track 1), and it removes the single biggest access barrier to participating in
> Mezo's vote-escrow economy at all (Track 2).

**Tech stack**

> Solidity 0.8.24 (`evmVersion: london`, matching `mezo-org/tigris` and
> `mezo-org/musd`), OpenZeppelin Contracts 5.0.2, Hardhat 3 with the viem toolbox.
> Tests run against a **fork of live Mezo testnet**, so they exercise the real VeBTC,
> VeBTCVoter, Router and gauges rather than mocks. Frontend is Next.js 16 (App Router),
> TypeScript, Tailwind 4, and viem — all chain state read through a single multicall,
> with no backend and no indexer.

**Future milestones**

> **1 — MUSD vote market (Wave 2, by 15 Nov 2026).** `MUSDVoteMarket`: anyone can pay
> MUSD to bid for the bloc's voting power, cleared as a per-epoch auction, with
> proceeds streaming to `lveBTC` stakers. This makes MUSD the unit of account for the
> price of a Mezo gauge vote, and nobody is doing it on Mezo today.
>
> **2 — A real exit and an on-chain optimiser (by mid-Dec 2026).** Seed an `lveBTC`/BTC
> stable pool and get it a gauge through the permissionless
> `PoolsVoter.createPoolGauge`, so holders can exit at a tight spread. Replace the
> operator with an on-chain optimiser that allocates votes to maximise MUSD-per-vote
> from live fee and incentive data.
>
> **3 — veMEZO boost, audit, mainnet (Q1 2027).** Integrate veMEZO boost (self-boost
> or via Matchbox) to push the bloc toward the 5x multiplier, add invariant and fuzz
> test suites plus a Goldsky subgraph, commission an external review, then deploy to
> Mezo mainnet behind a deposit cap.

**Team info**

> `<your name>` — solo builder. `<X or LinkedIn URL>`

---

**Links to attach**

| Field | Value |
|---|---|
| Testnet/mainnet link | `<vercel url>` |
| Public GitHub repository | `<github url>` |
| Project or product deck | `docs/DECK.md`, exported to PDF |
| 2-minute pitch video | `<video url>` |

---

## Pre-submission checklist

- [ ] Registered on AKINDO and the registration questions are complete
- [ ] Joined the Mezo Discord and asked for the Developer role
- [ ] Contracts deployed to Mezo testnet and **verified** on `explorer.test.mezo.org`
- [ ] A real deposit and a real vote are on-chain, so the live site shows non-zero state
- [ ] A MUSD stream has been notified, so "Claimable MUSD" visibly accrues
- [ ] Frontend deployed and reachable from a clean browser
- [ ] Repo is **public**, `.env` is not in it, README renders correctly
- [ ] Deck exported to PDF
- [ ] Video is under 2:00 and uploaded
- [ ] Submitted **before 2026-10-26 15:00 UTC**
