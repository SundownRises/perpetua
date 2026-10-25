import { defineChain } from "viem";

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
