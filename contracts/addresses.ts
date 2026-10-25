/**
 * Verified Mezo contract addresses.
 *
 * Sources:
 *  - mezo-org/tigris  `solidity/deployments/{testnet,mainnet}/*.json`  (ve(3,3) / DEX)
 *  - mezo-org/documentation `src/content/docs/docs/users/resources/contracts-reference.md` (tokens)
 *
 * The testnet entries were additionally confirmed live over JSON-RPC:
 *  - eth_chainId            -> 0x7b7b (31611)
 *  - VeBTC.token()          -> 0x7b7C...0000 (BTC)
 *  - VeBTC.voter()          -> VeBTCVoter below
 */

export const MEZO_TESTNET = {
  chainId: 31611,
  rpc: "https://rpc.test.mezo.org",
  explorer: "https://explorer.test.mezo.org",

  // Tigris ve(3,3) + DEX
  veBTC: "0xB63fcCd03521Cf21907627bd7fA465C129479231",
  veBTCVoter: "0x72F8dd7F44fFa19E45955aa20A5486E8EB255738",
  router: "0x9a1ff7FE3a0F69959A3fBa1F1e5ee18e1A9CD7E9",
  poolFactory: "0x4947243CC818b627A5D06d14C4eCe7398A23Ce1A",
  gaugeFactory: "0x027fa1adb4CF67558112dF7C4f83C6CFE9e0b7AD",
  votingRewardsFactory: "0x465445cc704DB1F2d2084D5751e03BDdBFAe0B06",
  rewardsDistributor: "0x10B0E7b3411F4A38ca2F6BB697aA28D607924729",

  // Tokens
  btc: "0x7b7C000000000000000000000000000000000000", // gas token, also an ERC-20
  musd: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
} as const;

export const MEZO_MAINNET = {
  chainId: 31612,
  rpc: "https://rpc.mezo.org",
  explorer: "https://explorer.mezo.org",

  veBTC: "0x7D807e9CE1ef73048FEe9A4214e75e894ea25914",
  veBTCVoter: "0x3A4a6919F70e5b0aA32401747C471eCfe2322C1b",
  router: "0x16A76d3cd3C1e3CE843C6680d6B37E9116b5C706",
  poolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
  gaugeFactory: "0xfa4FC53BEB5B7721d173342FfC24058e9D47a1Ff",
  votingRewardsFactory: "0xC67913137429985416DbCe28D9fa9ec960BA47BF",
  rewardsDistributor: "0x535E01F948458E0b64F9dB2A01Da6F32E240140f",

  // Permissionless gauge creation for whitelisted pools
  poolsVoter: "0x48233cCC97B87Ba93bCA212cbEe48e3210211f03",

  btc: "0x7b7C000000000000000000000000000000000000",
  musd: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  mezo: "0x7B7c000000000000000000000000000000000001",

  pools: {
    musdBtcVolatile: "0x52e604c44417233b6CcEDDDc0d640A405Caacefb",
    musdUsdcStable: "0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356",
    musdUsdtStable: "0x10906a9E9215939561597b4C8e4b98F93c02031A",
  },
} as const;

/** One week, the Tigris/Velodrome epoch length. Epochs roll Thursday 00:00 UTC. */
export const WEEK = 7n * 24n * 60n * 60n;
