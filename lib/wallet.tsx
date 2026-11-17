"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import {
  createWalletClient, custom,
  type Address, type WalletClient,
} from "viem";
import { CHAIN_ID, RPC_URL, giwaSepolia } from "./ammora";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

type WalletState = {
  address: Address | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);

function makeWalletClient(): WalletClient {
  return createWalletClient({
    chain: giwaSepolia,
    transport: custom(window.ethereum!),
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];
      const hexChain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      setChainId(parseInt(hexChain, 16));
      if (accounts[0]) {
        setAddress(accounts[0] as Address);
        setWalletClient(makeWalletClient());
      }
    } catch {
      // not connected yet
    }
  }, []);

  useEffect(() => {
    void sync();
    if (!window.ethereum?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const acc = (args[0] as string[])?.[0];
      setAddress(acc ? (acc as Address) : null);
      setWalletClient(acc ? makeWalletClient() : null);
    };
    const onChain = (...args: unknown[]) => {
      setChainId(parseInt(args[0] as string, 16));
    };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, [sync]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet found. Install MetaMask (or any EIP-1193 wallet) and try again.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const hexChain = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (parseInt(hexChain, 16) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr: unknown) {
          const code = (switchErr as { code?: number })?.code;
          if (code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: `0x${CHAIN_ID.toString(16)}`,
                chainName: "GIWA Sepolia",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }
      await sync();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, [sync]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setWalletClient(null);
  }, []);

  const value = useMemo<WalletState>(() => ({
    address, chainId, walletClient, connecting, error, connect, disconnect,
  }), [address, chainId, walletClient, connecting, error, connect, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

export function shortAddr(a: Address): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
