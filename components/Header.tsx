"use client";

import Link from "next/link";
import { useWallet, shortAddr } from "../lib/wallet";

function ConnectButton() {
  const { address, connect, connecting, disconnect } = useWallet();
  if (address) {
    return (
      <button className="btn" onClick={disconnect} title={address}>
        {shortAddr(address)} · Disconnect
      </button>
    );
  }
  return (
    <button className="btn primary" onClick={connect} disabled={connecting}>
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

export function WalletError() {
  const { error } = useWallet();
  if (!error) return null;
  return <p className="wallet-error">{error}</p>;
}

export default function Header() {
  return (
    <header className="header">
      <Link href="/" className="logo">
        <span className="logo-mark">◈</span> GiwaPad
      </Link>
      <nav>
        <Link href="/">Exchange</Link>
        <Link href="/launch">Launchpad</Link>
        <Link href="/creator">Creator earnings</Link>
        <a href="https://ammora.org/waitlist#mission" target="_blank" rel="noreferrer">Ammora Season 2 ↗</a>
      </nav>
      <ConnectButton />
    </header>
  );
}
