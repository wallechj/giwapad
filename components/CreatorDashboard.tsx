"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Address } from "viem";
import {
  EXPLORER_URL,
  FEE_VAULT_FALLBACK,
  TAMM,
  buildClaimFeeTx,
  getClaimable,
  getFeeVault,
  getMigrationProgress,
  getPublicClient,
  scanRecentLaunches,
  type LaunchItem,
} from "../lib/ammora";
import { useWallet, shortAddr } from "../lib/wallet";
import { loadMyLaunches } from "./CreateLaunch";

type RowState = {
  progressBps: number;
  current: bigint;
  target: bigint;
  status: number;
  pool: Address;
  myBalance: string;
  loading: boolean;
};

export default function CreatorDashboard() {
  const { address, walletClient, connect, connecting } = useWallet();
  const [vault, setVault] = useState<Address>(FEE_VAULT_FALLBACK);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [launches, setLaunches] = useState<LaunchItem[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refreshFees = useCallback(async (wallet: Address) => {
    const client = getPublicClient();
    const v = await getFeeVault(client);
    setVault(v);
    setClaimable(await getClaimable(client, v, TAMM.weth, wallet));
  }, []);

  const load = useCallback(async (wallet: Address) => {
    setLoading(true);
    setErr(null);
    try {
      await refreshFees(wallet);
      const mine = loadMyLaunches();
      const scanned = await scanRecentLaunches(getPublicClient(), 100_000n);
      const all = [
        ...mine,
        ...scanned.filter((x) => !mine.some((m) => m.token.toLowerCase() === x.token.toLowerCase())),
      ].filter((x) => x.creator.toLowerCase() === wallet.toLowerCase());
      setLaunches(all);

      const client = getPublicClient();
      const next: Record<string, RowState> = {};
      for (const l of all) {
        try {
          const p = await getMigrationProgress(client, l.curve);
          let bal = "—";
          try {
            const dec = await client.readContract({ address: l.token, abi: erc20Abi, functionName: "decimals" });
            const raw = await client.readContract({ address: l.token, abi: erc20Abi, functionName: "balanceOf", args: [wallet] });
            bal = formatUnits(raw, dec);
          } catch { /* ignore */ }
          next[l.token] = {
            progressBps: p.progressBps, current: p.current, target: p.target,
            status: p.status, pool: p.canonicalPool as Address, myBalance: bal, loading: false,
          };
        } catch {
          next[l.token] = { progressBps: 0, current: 0n, target: 0n, status: -1, pool: "0x0000000000000000000000000000000000000000" as Address, myBalance: "—", loading: false };
        }
      }
      setRows(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [refreshFees]);

  useEffect(() => {
    if (address) void load(address);
  }, [address, load]);

  const claim = async () => {
    if (!address || !walletClient || !claimable || claimable === 0n) return;
    setClaiming(true);
    setMsg(null);
    setErr(null);
    try {
      const tx = buildClaimFeeTx(TAMM.weth, address, address);
      const hash = await walletClient.sendTransaction({ account: address, to: vault, data: tx.data, chain: walletClient.chain });
      setMsg("Claim sent — waiting for confirmation…");
      await getPublicClient().waitForTransactionReceipt({ hash });
      setMsg(`Claimed ${formatUnits(claimable, 18)} WETH ✓`);
      await refreshFees(address);
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : "Claim failed");
    } finally {
      setClaiming(false);
    }
  };

  if (!address) {
    return (
      <section className="card">
        <h2>Creator earnings</h2>
        <p className="muted">Connect the wallet you launched tokens with to see your fees and launches.</p>
        <button className="btn primary" onClick={connect} disabled={connecting}>Connect wallet</button>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Creator earnings</h2>
        <span className="pill">{shortAddr(address as Address)}</span>
      </div>
      <p className="muted">
        Trading fees from your launches settle in WETH in Ammora&apos;s FeeVault.
        Claim them here — the payout goes to your wallet.
      </p>

      <div className="quote-row">
        <span>Claimable launch fees (WETH)</span>
        <strong>{claimable === null ? "…" : `${formatUnits(claimable, 18)} WETH`}</strong>
      </div>
      <button className="btn primary" onClick={claim} disabled={claiming || !claimable || claimable === 0n}>
        {claiming ? "Confirm in wallet…" : "Claim fees"}
      </button>
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
      <p className="muted small mono">FeeVault: {vault}</p>

      <h3 style={{ marginTop: 24 }}>My launches ({launches.length})</h3>
      {loading && <p className="muted">Loading your launches…</p>}
      {!loading && launches.length === 0 && (
        <p className="muted">
          No launches from this wallet in the scanned window. <a href="/launch">Launch your first token →</a>
        </p>
      )}
      <ul className="launches">
        {launches.map((l) => {
          const r = rows[l.token];
          return (
            <li key={l.token}>
              <div className="launch-detail" style={{ paddingTop: 4 }}>
                <b>{l.name}</b> <span className="muted">${l.symbol}</span>
                <span className="muted small"> · config #{l.configId.toString()}</span>
                <div className="mono small muted">Token: {l.token}<br />Curve: {l.curve}</div>
                {r && !r.loading && (
                  <>
                    <div className="progress">
                      <div className="progress-bar" style={{ width: `${r.status === 3 ? 100 : Math.min(100, r.progressBps / 100)}%` }} />
                    </div>
                    <p className="muted small">
                      Graduation: {r.status === 3 ? "100" : (r.progressBps / 100).toFixed(1)}% · raised {formatUnits(r.current, 18)} / {formatUnits(r.target, 18)} WETH
                      {r.status === 3 ? " · graduated ✓" : r.status === 1 ? " · live curve" : ` · status ${r.status}`}
                    </p>
                    {r.status === 3 && r.pool !== "0x0000000000000000000000000000000000000000" && (
                      <p className="muted small mono">Pool: {r.pool}</p>
                    )}
                    <p className="muted small">You hold: {r.myBalance} ${l.symbol}</p>
                  </>
                )}
                <p>
                  <a href={`${EXPLORER_URL}/tx/${l.txHash}`} target="_blank" rel="noreferrer">Launch tx ↗</a>
                  {" · "}
                  <a href="/">Trade →</a>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <button className="btn ghost" onClick={() => address && load(address)} disabled={loading}>
        Refresh
      </button>
    </section>
  );
}
