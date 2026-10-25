"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient } from "viem";
import { mezoTestnet, mezoTestnetParams } from "./chain";

/** EIP-1193 surface we rely on. */
type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: never[]) => void) => void;
  removeListener?: (event: string, handler: (...args: never[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

/** Read-only client. Always available, so the dashboard renders before connecting. */
export const publicClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(),
});

export type WalletState = {
  address: Address | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  hasProvider: boolean;
  onMezo: boolean;
  connect: () => Promise<void>;
  switchToMezo: () => Promise<void>;
  walletClient: WalletClient | null;
};

export function useWallet(): WalletState {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    setHasProvider(typeof window !== "undefined" && !!window.ethereum);
  }, []);

  const readChain = useCallback(async () => {
    if (!window.ethereum) return;
    const id = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    setChainId(Number.parseInt(id, 16));
  }, []);

  // Pick up an already-authorised account on load, and follow wallet changes.
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    const eth = window.ethereum;

    (async () => {
      try {
        const accounts = (await eth.request({ method: "eth_accounts" })) as Address[];
        if (accounts.length > 0) setAddress(accounts[0]);
        await readChain();
      } catch {
        /* wallet locked or user never connected; nothing to do */
      }
    })();

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as Address[];
      setAddress(accounts && accounts.length > 0 ? accounts[0] : null);
    };
    const onChain = (...args: never[]) => {
      const id = args[0] as unknown as string;
      setChainId(Number.parseInt(id, 16));
    };

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [readChain]);

  const connect = useCallback(async () => {
    setError(null);
    if (!window.ethereum) {
      setError("No browser wallet found. Install MetaMask to continue.");
      return;
    }
    setConnecting(true);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
      setAddress(accounts[0] ?? null);
      await readChain();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setConnecting(false);
    }
  }, [readChain]);

  /** Switches to Mezo, adding the network first if the wallet has never seen it. */
  const switchToMezo = useCallback(async () => {
    setError(null);
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: mezoTestnetParams.chainId }],
      });
    } catch (e) {
      // 4902 = chain unknown to the wallet.
      const code = (e as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        try {
          await window.ethereum.request({ method: "wallet_addEthereumChain", params: [mezoTestnetParams] });
        } catch (addErr) {
          setError(friendly(addErr));
          return;
        }
      } else {
        setError(friendly(e));
        return;
      }
    }
    await readChain();
  }, [readChain]);

  const walletClient =
    address && typeof window !== "undefined" && window.ethereum
      ? createWalletClient({ account: address, chain: mezoTestnet, transport: custom(window.ethereum) })
      : null;

  return {
    address,
    chainId,
    connecting,
    error,
    hasProvider,
    onMezo: chainId === mezoTestnet.id,
    connect,
    switchToMezo,
    walletClient,
  };
}

export function friendly(e: unknown): string {
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage
    ?? (e as { message?: string })?.message
    ?? String(e);
  if (/user rejected|User denied/i.test(msg)) return "Transaction rejected in wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough BTC for gas. Top up at faucet.test.mezo.org.";
  return msg.split("\n")[0].slice(0, 180);
}
