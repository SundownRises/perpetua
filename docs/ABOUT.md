## The problem it solves

Mezo's vote-escrow system is where the chain's value actually gets directed. veBTC holders steer weekly MEZO emissions across gauges and collect 100% of the trading fees from the pools they vote for. It works — but holding veBTC directly is a part-time job, and that quietly excludes most of the people who should be participating.

Six frictions compound:

| Friction | Consequence |
|---|---|
| Maximum lock is **28 days** | Re-lock every month or the position dies |
| Weight **decays linearly to zero** | Your voting power is a wasting asset |
| Boost must be manually **poked** | Forget, and your multiplier silently lags |
| Fees and incentives are claimed **per epoch** | Unclaimed rewards are forfeited outright |
| The 5x boost needs disproportionate **veMEZO** | Small holders can never reach it |
| A lock is an **NFT** | Illiquid, and unusable as collateral anywhere else |

The net effect is that veBTC rewards large, active, sophisticated holders and penalises everyone else. Capital that should be deepening MUSD liquidity sits idle instead, because the upkeep costs more than the yield is worth at small size.

**Perpetua collapses all of that into one deposit.**

You deposit BTC and receive **`lveBTC`**, a plain ERC-20, one-to-one. Behind it, the protocol holds a single veBTC position converted to a **permanent lock**, so it never decays and never needs re-locking. Every subsequent deposit grows that same position rather than fragmenting into many small decaying NFTs, which means a small depositor inherits the voting weight of the whole bloc. Perpetua votes that bloc on Mezo's MUSD gauges, claims the resulting trading fees and external incentives, converts them to **MUSD** on-chain through Mezo's Router, and streams the MUSD to `lveBTC` stakers over each 7-day epoch.

So `lveBTC` is a Bitcoin-denominated position that pays a dollar coupon, with no decay, no weekly ritual, and a liquid token instead of a 28-day lock.

**MUSD is the unit of account for the entire protocol, in three independent layers:**

1. **All yield is paid in MUSD.** Every harvest is swapped to MUSD before it reaches holders.
2. **The fees captured genuinely *are* MUSD fees.** Of the gauges live on Mezo testnet, **3 of 4 are MUSD pairs** — MUSD/BTC, MUSD/mUSDC and MUSD/mT. Voting fee revenue *is* MUSD trading revenue. This isn't a claim in a pitch; it's asserted by a test that reads Mezo's live `VeBTCVoter` and fails if it stops being true.
3. **It directs MEZO emissions.** `VeBTCVoter.vote` is what steers weekly emissions, and Perpetua points a growing bloc of that power at MUSD liquidity. Every new deposit therefore deepens the MUSD market.

Critically, this is infrastructure rather than a destination app. `lveBTC` is a new composable primitive — other Mezo protocols can accept it as collateral or pair it in a pool from day one, without Perpetua's cooperation.

**Live on Mezo testnet (chain 31611):**

- App — https://perpetua-chi.vercel.app
- `PerpetuaLocker` — `0x7790053dd08fcde21dd265e6d89f804f5eada73c`
- `lveBTC` — `0x42127777c9A321cAE6aCEF77673CE99D8D718d3f`
- `MUSDRewardStreamer` — `0xbdc30dbe11c217194f5e8e6847ada72edfe9504d`

The deployed instance holds a real permanent position (veNFT #408), has a live 60/40 vote across the MUSD/BTC and MUSD/mUSDC gauges, and is currently streaming 39.32 MUSD to stakers.

---

## Technologies I used

**Smart contracts** — Solidity `0.8.24` with `evmVersion: "london"`, matching `mezo-org/tigris` and `mezo-org/musd` exactly. This matters: the Solidity default would target Cancun and emit `PUSH0`/`MCOPY`, and Mezo's own repos pin London with the comment *"latest EVM version supported on Mezo is London."* The same constraint forced pinning OpenZeppelin to **5.0.2**, because 5.6 requires `MCOPY`.

Three contracts, deliberately small:

- **`PerpetuaLocker`** — owns the veNFT; handles deposits, lock upkeep, vote direction and harvesting. It reads the escrowed asset from `IVeBTC.token()` rather than a constructor argument, so the pair can't be mismatched by a bad deploy. It deploys its own `lveBTC` in its constructor, so both links are `immutable` with no initialisation window. Lock upkeep (`extendLock`, `poke`, `makePermanent`) is permissionless, so an absent operator can never strand the position.
- **`LveBTC`** — the liquid receipt token. Mint is restricted to the locker, immutably. Accounting is 1:1 by design: because deposits are irreversible there is no NAV to compute, and therefore no share price to manipulate.
- **`MUSDRewardStreamer`** — stake `lveBTC`, earn MUSD, using the Synthetix `StakingRewards` accumulator because it's heavily audited and widely understood. It refuses to promise a reward stream it doesn't already hold, and `recover()` cannot touch staked principal or MUSD already owed.

**Testing** — Hardhat 3 with the viem toolbox, running against a **fork of live Mezo testnet**, so tests exercise the real `VeBTC`, `VeBTCVoter`, `Router` and gauges rather than mocks. 15 tests pass. The ones that matter prove the product thesis against Mezo's own deployed escrow:

- `lockPermanent` succeeds, and the escrow agrees the lock is permanent
- voting power is **unchanged after 4 weeks** — past the 28-day MAXTIME at which an ordinary lock would be worth zero
- a 70/30 vote lands on the real MUSD gauges and reads back as 1.4 / 0.6 through `VeBTCVoter.votes`
- later deposits grow one aggregated position via `increaseAmount`, never a second NFT

Forking Mezo took three non-obvious settings, all documented in `hardhat.config.ts`: EDR ships no `hardforkHistory` for chain 31611; it must be `shanghai`, because Mezo's system contracts use `PUSH0` and `london` dies with *"invalid opcode"*; and it must **not** be `cancun`, because Mezo blocks carry no `excessBlobGas`. One substitution is unavoidable — Mezo's BTC facade is backed by Cosmos bank-module state hooks inside `mezod` that EDR can't reproduce, so tests inject a plain ERC-20 at that address. Every other Mezo contract is used exactly as deployed.

**Frontend** — Next.js 16 (App Router), TypeScript, Tailwind CSS 4, and viem. Every figure is read live from chain through a single multicall; there is no backend and no indexer. The gauge table is Mezo's real `VeBTCVoter` state, not a fixture. A first-time visitor can add Mezo testnet to their wallet in one click. Yield is shown as *MUSD per lveBTC per year* rather than an APR, because the numerator is MUSD and the denominator is BTC-denominated — collapsing them into one percentage would imply a BTC/USD price the app doesn't fetch.

The data layer is deliberately separated from React (`lib/reads.ts` carries no React dependency) so it can be driven from a plain Node script. `npm run check:reads` exercises the exact read path the UI uses against live Mezo and asserts 14 invariants — written after a chain-config bug shipped that every contract test passed straight through.

**Infrastructure** — Mezo testnet for contracts, Vercel for the app, Goldsky-ready subgraph structure for later. A one-command `seed.ts` script puts a fresh deployment into demo-ready state: deposit, vote, stake, swap BTC→MUSD through the real Router, and open the reward stream.

---

## What's next for Perpetua

**1 — `MUSDVoteMarket`, the piece that makes this more than a yield wrapper.**
Right now Perpetua decides where the bloc votes. Next, anyone can **pay MUSD to bid for that voting power**, cleared as a per-epoch auction, with proceeds streaming to `lveBTC` stakers. Protocols that need MUSD liquidity in a specific gauge could rent concentrated voting power instead of accumulating and maintaining veBTC themselves. That makes **MUSD the unit of account for the price of a Mezo gauge vote** — a market that doesn't exist on Mezo today, and the natural endpoint of the primitive built in Wave 1.

**2 — A real exit.**
Deposits are currently irreversible: the position is permanent, so there is no redemption path and holders exit by selling, exactly like Convex's `cvxCRV`. That's an honest limitation and the fix is concrete — seed an `lveBTC`/BTC stable pool and give it a gauge through the permissionless `PoolsVoter.createPoolGauge`, so holders can exit at a tight spread and the token becomes genuinely liquid.

**3 — Replace the operator with an on-chain optimiser.**
Vote direction and harvesting are operator-gated today. The replacement is an allocator that maximises MUSD-per-vote from live fee and incentive data, removing the last discretionary step and the trust assumption that comes with it.

**4 — veMEZO boost.**
The bloc currently votes at 1x. Integrating veMEZO boost — self-boosting, or interoperating with Matchbox — pushes it toward the 5x multiplier. Because boost scales with the share of veMEZO directed at a position, a single large aggregated position is far more capital-efficient to boost than many small ones. This is where pooling compounds.

**5 — Hardening, then mainnet.**
Perpetua is deliberately on testnet: permanently locking real BTC behind unaudited contracts would be irresponsible. The path to mainnet is invariant and fuzz test suites, a Goldsky subgraph for historical accounting, Blockscout source verification, and an external security review — then a mainnet deployment behind a deposit cap that lifts as the contracts earn trust.
