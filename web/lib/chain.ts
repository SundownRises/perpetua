import { createPublicClient, defineChain, http } from "viem";

/**
 * Mezo testnet. Chain ID confirmed live via eth_chainId -> 0x7b7b (31611).
 * BTC is the gas token (18 decimals), and is also exposed as an ERC-20 at
 * 0x7b7C..0000.
 */
export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"], webSocket: ["wss://rpc-ws.test.mezo.org"] },
  },
  blockExplorers: {
    default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" },
  },
  contracts: {
    // Mezo has Multicall3 at the canonical cross-chain address. Without this entry
    // viem refuses every `multicall`, with:
    //   Chain "Mezo Testnet" does not support contract "multicall3"
    // Confirmed live: multicall3.getBlockNumber() and aggregate3() both execute.
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** Shape used by `wallet_addEthereumChain` so a first-time judge can add Mezo in one click. */
export const mezoTestnetParams = {
  chainId: "0x7b7b",
  chainName: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: ["https://rpc.test.mezo.org"],
  blockExplorerUrls: ["https://explorer.test.mezo.org"],
} as const;

export const explorer = (path: string) => `${mezoTestnet.blockExplorers.default.url}${path}`;

/**
 * Read-only client. Lives here rather than alongside the wallet hook so that the
 * data layer carries no React dependency and can be exercised from a plain Node
 * script -- see scripts/check-reads.mjs.
 */
export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(),
});
