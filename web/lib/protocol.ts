"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { IS_DEPLOYED, readProtocol, readUser, type ProtocolState, type UserState } from "./reads";

// Re-exported so components keep a single import site for the data layer.
export * from "./reads";

/** Polls protocol + user state, and exposes a `refresh` for use after a tx lands. */
export function useProtocol(account: Address | null) {
  const [protocol, setProtocol] = useState<ProtocolState | null>(null);
  const [user, setUser] = useState<UserState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!IS_DEPLOYED) {
      setLoading(false);
      return;
    }
    try {
      const p = await readProtocol();
      setProtocol(p);
      setUser(account ? await readUser(account) : null);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message.split("\n")[0]);
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 12_000);
    return () => clearInterval(t);
  }, [refresh]);

  return { protocol, user, loading, err, refresh };
}

