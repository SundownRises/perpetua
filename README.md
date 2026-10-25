# Perpetua — liquid veBTC with a MUSD coupon

**Deposit BTC once. Get a liquid token that never decays and pays you in MUSD.**

Perpetua aggregates BTC into a single, permanently-locked `veBTC` position on Mezo,
votes it as a bloc on Mezo's MUSD gauges, harvests the trading fees and incentives
that vote earns, converts them to **MUSD**, and streams them to holders of a liquid
ERC-20 called **`lveBTC`**.

Built for the [Mezo Buildathon](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10).
Tracks 1 (DeFi) and 2 (Access & Distribution).

---

## The problem

Mezo's vote-escrow system works, but holding `veBTC` directly is painful:

| Friction | Consequence |
|---|---|
| Maximum lock is **28 days** | You re-lock monthly or your position dies |
| Weight **decays linearly to zero** | Your voting power is a wasting asset |
| Boost must be manually **poked** | Forget, and your multiplier silently lags |
| Fees and incentives must be **claimed each epoch** | Unclaimed rewards are forfeited |
| The 5x boost needs disproportionate **veMEZO** | Small holders can never reach it |
| A lock is an **NFT** | Illiquid; can't be used as collateral elsewhere |

Net effect: veBTC rewards large, active, sophisticated holders and quietly penalises
everyone else. The capital that *should* be securing MUSD liquidity sits idle instead.

## The solution

One deposit, and Perpetua absorbs all of that upkeep:

```
                   ┌──────────────────────────────────────────────┐
   you ──BTC──▶    │  PerpetuaLocker                              │
                   │  • one veBTC NFT, lockPermanent()            │
   you ◀─lveBTC─   │  • every deposit → increaseAmount()          │
                   │  • votes the bloc via VeBTCVoter.vote()      │
                   │  • claimFees() + claimBribes() each epoch    │
                   └───────────────────┬──────────────────────────┘
                                       │ harvested tokens
                                       ▼
                   ┌──────────────────────────────────────────────┐
   you ─lveBTC─▶   │  MUSDRewardStreamer                          │
                   │  • swaps harvest → MUSD via Mezo Router      │
   you ◀──MUSD──   │  • streams MUSD over one 7-day epoch         │
                   └──────────────────────────────────────────────┘
```

- **No decay.** The position is permanent, so weight never bleeds away.
- **No upkeep.** No re-locking, no poking, no weekly claim ritual.
- **Liquid.** `lveBTC` is a plain ERC-20, so it composes as collateral elsewhere.
- **Scale.** Small deposits join a bloc large enough to matter in gauge votes.

## How this integrates MUSD and MEZO

Three independent layers, not a token mention:

1. **Yield is denominated in MUSD.** Everything the bloc earns is converted to MUSD
   on-chain through Mezo's Router and streamed to stakers. `lveBTC` is therefore a
   BTC-denominated position paying a dollar coupon.
2. **The fees captured *are* MUSD fees.** Of the gauges live on Mezo testnet,
   **3 of 4 are MUSD pairs** (MUSD/BTC, MUSD/mUSDC, MUSD/mT) — verified on-chain by
   `test/mezo-integration.ts`, which fails if that stops being true. Voting fee
   revenue is MUSD trading revenue.
3. **It directs MEZO emissions.** `VeBTCVoter.vote` is what steers weekly MEZO
   emissions; Perpetua points a growing bloc of that power at MUSD liquidity.

## Deployed addresses — Mezo testnet (chain 31611)

See [`deployments/mezoTestnet.json`](deployments/mezoTestnet.json) for the
machine-readable version written at deploy time.

| Contract | Address |
|---|---|
| `PerpetuaLocker` | _see deployments file_ |
| `lveBTC` | _see deployments file_ |
| `MUSDRewardStreamer` | _see deployments file_ |

Mezo contracts this builds on, all verified live by `eth_call` (not copied from docs):

| Mezo contract | Address |
|---|---|
| VeBTC | `0xB63fcCd03521Cf21907627bd7fA465C129479231` |
| VeBTCVoter | `0x72F8dd7F44fFa19E45955aa20A5486E8EB255738` |
| Router | `0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9` |
| BTC (ERC-20 facade) | `0x7b7C000000000000000000000000000000000000` |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |

## Contracts

| File | Role |
|---|---|
| [`PerpetuaLocker.sol`](contracts/contracts/PerpetuaLocker.sol) | Owns the veNFT; deposits, lock upkeep, voting, harvesting |
| [`LveBTC.sol`](contracts/contracts/LveBTC.sol) | Liquid receipt token; mint restricted to the locker, immutably |
| [`MUSDRewardStreamer.sol`](contracts/contracts/MUSDRewardStreamer.sol) | Stake `lveBTC`, earn MUSD; Synthetix accumulator |

Design notes worth calling out:

- **1:1 accounting.** Because deposits are irreversible there is no NAV to compute,
  and therefore no share price to manipulate. 1 lveBTC per 1 BTC, always.
- **The locker deploys its own token** in its constructor, so `locker → token` and
  `token → locker` are both `immutable` with no initialisation window.
- **BTC is read from the escrow** (`IVeBTC.token()`) rather than passed in, so the
  pair can never be mismatched by a bad deploy argument.
- **Lock upkeep is permissionless.** `extendLock()` and `poke()` need no privileges,
  so an absent operator can never strand the position. If `lockPermanent` were ever
  unavailable, `makePermanent()` can be retried by anyone and `extendLock()` keeps
  the lock pinned at MAXTIME in the meantime.
- **Solvency is enforced, not assumed.** The streamer refuses to promise a reward
  stream it does not already hold (`Insolvent`), and `recover()` cannot touch staked
  principal or MUSD already owed.

## Trust assumptions — read this

Stated plainly rather than buried:

- **Deposits are irreversible.** The veBTC position is permanent, so there is no
  redemption. `lveBTC` holders exit by selling on the secondary market, exactly like
  Convex's `cvxCRV`. A `lveBTC`/BTC pool is the next milestone; until it exists,
  liquidity is thin.
- **Vote direction and harvesting are operator-gated.** The operator can choose
  *where* the bloc votes and *when* rewards are harvested. It cannot withdraw the
  position, mint `lveBTC`, or take staked principal.
- **Unaudited, on testnet.** Deliberate: permanently locking real BTC behind
  unaudited contracts would be irresponsible, and the Buildathon rules accept Mezo
  testnet.

## Running it

Prerequisites: Node 20+, npm, a wallet with Mezo testnet BTC from
[faucet.test.mezo.org](https://faucet.test.mezo.org/).

```bash
# contracts
cd contracts
npm install
npx hardhat compile

# unit tests (plain in-memory chain)
npx hardhat test test/streamer.ts --network local

# integration tests against a FORK of real Mezo testnet
npx hardhat test test/locker.ts --network mezoFork
npx hardhat test test/mezo-integration.ts --network mezoFork

# deploy (writes deployments/ and web/lib/deployment.json)
echo "MEZO_DEPLOYER_PRIVATE_KEY=0x..." > .env
npx hardhat run scripts/deploy.ts --network mezoTestnet

# frontend
cd ../web
npm install
npm run dev     # http://localhost:3000
```

## Testing approach

Tests run against a **fork of live Mezo testnet**, so the real `VeBTC`, `VeBTCVoter`,
`Router` and gauges are exercised rather than mocks. `test/locker.ts` proves the
claims this project rests on:

- `lockPermanent` succeeds on Mezo's VeBTC, and the escrow agrees the lock is permanent
- voting power is **unchanged after 4 weeks** — past the 28-day MAXTIME at which an
  ordinary lock would be worth zero
- a 70/30 vote lands on the real MUSD/BTC and MUSD/mUSDC gauges and reads back as
  1.4 / 0.6 through `VeBTCVoter.votes`
- later deposits grow **one** aggregated position rather than fragmenting into many NFTs
- non-operators cannot direct votes

Three things about forking Mezo that cost real time, recorded so nobody repeats them
(all encoded in [`hardhat.config.ts`](contracts/hardhat.config.ts)):

1. **`hardforkHistory` is mandatory.** EDR ships no history for chain 31611 and fails
   with *"No known hardfork for execution on historical block"*.
2. **It must be `shanghai`.** Mezo's system contracts use `PUSH0`, so `london` dies
   with *"invalid opcode"* — but it must **not** be `cancun`, because Mezo blocks
   carry no `excessBlobGas` and every call fails with *"`excess_blob_gas` not set"*.
3. **Compile for `london` anyway.** `mezo-org/tigris` and `mezo-org/musd` both pin
   `evmVersion: "london"` with the comment *"latest EVM version supported on Mezo is
   London"*. Defaulting to cancun would emit `PUSH0`/`MCOPY` and risk deployment.
   This also means OpenZeppelin is pinned to **5.0.2** — 5.6 requires `MCOPY`.

One substitution is necessary: Mezo's BTC facade is backed by Cosmos bank-module
state hooks inside `mezod`, which EDR cannot reproduce, so calls to it revert on a
fork even with byte-identical code. Tests inject a plain ERC-20 at that address
(see [`test/helpers.ts`](contracts/test/helpers.ts)). It is the same interface the
real facade presents, and every other Mezo contract is used exactly as deployed.

## Roadmap

The piece that makes this more than a yield wrapper:

- **`MUSDVoteMarket`** — let anyone pay **MUSD** to bid for the bloc's voting power,
  cleared as a per-epoch auction, with proceeds streaming to `lveBTC` stakers. That
  makes MUSD the unit of account for the price of Mezo gauge votes. Nobody is doing
  this on Mezo today.
- **Replace the operator** with an on-chain optimiser that allocates votes to
  maximise MUSD-per-vote from live fee and bribe data.
- **veMEZO boost** — self-boost, or interoperate with
  [Matchbox](https://matchbox.markets/), to push the bloc toward the 5x multiplier.
- **A real exit** — seed an `lveBTC`/BTC stable pool and use the permissionless
  `PoolsVoter.createPoolGauge` to get it a gauge.
- **Hardening** — invariant and fuzz tests, a Goldsky subgraph for history, and a
  written security review.

## License

MIT
