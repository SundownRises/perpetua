# 2-minute demo video — shot list and script

Hard limit is 2:00. This is timed to 1:52, which leaves room to breathe. Record the
screen at 1920×1080, browser zoom 110% so numbers are legible after compression.

**Before you hit record**
- Deployer funded, contracts deployed, `web/lib/deployment.json` written.
- At least one deposit already made and one vote already cast, so the dashboard
  shows non-zero state the moment it appears. A zeroed dashboard reads as broken.
- A MUSD stream already notified, so "Claimable MUSD" is ticking upward on camera.
- Wallet holds test BTC, and a second small amount ready to deposit live.
- Close every other tab. Hide bookmarks. Clear notifications.

---

### 0:00–0:12 · The claim

**Show:** the dashboard, already loaded, hero figure visible.

> "This is Perpetua. On Mezo, a veBTC lock maxes out at 28 days and its voting power
> decays to zero. Perpetua makes that position permanent, liquid, and paid in MUSD."

---

### 0:12–0:32 · The problem, concretely

**Show:** scroll to the `Permanent lock — no decay` badge, then the "Bloc voting
power" tile.

> "Holding veBTC yourself means re-locking every month, poking your boost, and
> claiming fees every epoch or forfeiting them. Miss a week and your position bleeds
> value. Small holders also can't reach the 5x boost at all — it needs far more
> veMEZO than they have."

---

### 0:32–0:52 · Deposit, live

**Show:** type an amount into Deposit, approve if needed, confirm in the wallet, wait
for the receipt, point at the lveBTC balance appearing.

> "I deposit BTC. It joins one permanently-locked position the protocol owns, and I
> get lveBTC one-to-one. That's a plain ERC-20 — I can sell it or use it as collateral.
> What I can't do is withdraw: the lock is permanent, and the UI says so."

*(Pause on the "deposits can never be withdrawn" notice for a beat — volunteering the
limitation is more convincing than hiding it.)*

---

### 0:52–1:12 · Where the vote goes

**Show:** scroll to the gauge table. Point at the MUSD badges and the "Our vote" column.

> "Perpetua votes that whole bloc. This table is read live from Mezo's VeBTCVoter —
> three of the four live gauges are MUSD pairs, so the fees this vote earns are MUSD
> trading fees. The vote also steers weekly MEZO emissions toward MUSD liquidity."

---

### 1:12–1:32 · Get paid in MUSD

**Show:** stake lveBTC, then the "Claimable MUSD" figure, then click Claim and show
the wallet MUSD balance change.

> "I stake lveBTC and earn the harvest, converted to MUSD on-chain through Mezo's
> Router and streamed over one epoch. So lveBTC is a Bitcoin-denominated position
> paying a dollar coupon. Claim, and the MUSD is in my wallet."

---

### 1:32–1:52 · Real contracts, and what's next

**Show:** terminal with the fork test run — the 4-week no-decay assertion and the
70/30 vote result visible. Then cut back to the browser on the explorer page for the
locker.

> "The tests run against a fork of live Mezo testnet, so this is the real VeBTC and
> real Voter, not mocks — including proof the position still has full voting power
> four weeks out, past the point an ordinary lock would be worthless.
>
> Next is the MUSD vote market: letting anyone pay MUSD to bid for this bloc's votes.
> That makes MUSD the price of influence on Mezo. Thanks for watching."

---

## Recording notes

- **Don't narrate the UI** ("now I click here"). Say what it *means*.
- Cut dead air while transactions confirm — jump-cut to the confirmed state rather
  than filming a spinner for 8 seconds.
- Say "MUSD" and "veBTC" clearly; they're the words the judges are listening for.
- If a transaction fails on camera, keep the take and cut it later. Re-recording the
  whole run costs more than an edit.
- Export at 1080p, under 100 MB so it uploads cleanly.
