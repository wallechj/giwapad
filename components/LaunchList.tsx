"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import {
  EXPLORER_URL,
  TAMM,
  buildCurveBuyTx,
  ensureAllowance,
  getCurveState,
  getPublicClient,
  planCurveSell,
  quoteCurveBuy,
  scanRecentLaunches,
  type LaunchItem,
} from "../lib/ammora";
import { useWallet, shortAddr } from "../lib/wallet";
import { loadMyLaunches } from "./CreateLaunch";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function TradePanel({ launch }: { launch: LaunchItem }) {
  const { address, walletClient, connect } = useWallet();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.001");
  const [quote, setQuote] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [decimals, setDecimals] = useState<number>(9);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const client = getPublicClient();
    getCurveState(client, launch.curve).then((s) => setStatus(s.status)).catch(() => undefined);
    client.readContract({ address: launch.token, abi: erc20Abi, functionName: "decimals" })
      .then((d) => setDecimals(d))
      .catch(() => undefined);
  }, [launch]);

  useEffect(() => {
    setQuote(null);
    setErr(null);
    if (!amount || Number(amount) <= 0 || status !== 1) return;
    const t = setTimeout(async () => {
      try {
        const client = getPublicClient();
        if (mode === "buy") {
          const out = await quoteCurveBuy(client, launch.curve, parseUnits(amount, 18));
          setQuote(`${formatUnits(out, decimals)} ${launch.symbol}`);
        } else {
          const plan = await planCurveSell(client, launch.curve, launch.token, parseUnits(amount, decimals), address ?? launch.creator);
          setQuote(`${formatUnits(plan.amountOut, 18)} ETH`);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message.slice(0, 160) : "Quote failed");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [amount, mode, status, launch, decimals, address]);

  const trade = async () => {
    if (!address || !walletClient) { await connect(); return; }
    if (status !== 1 || !amount || Number(amount) <= 0) return;
    const client = getPublicClient();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (mode === "buy") {
        const tx = await buildCurveBuyTx(client, launch.curve, parseUnits(amount, 18), address);
        const hash = await walletClient.sendTransaction({ account: address, to: tx.to, data: tx.data, value: tx.value, chain: walletClient.chain });
        setMsg("Buy sent — waiting for confirmation…");
        await client.waitForTransactionReceipt({ hash });
        setMsg(`Bought ${launch.symbol} ✓`);
      } else {
        const amountIn = parseUnits(amount, decimals);
        const plan = await planCurveSell(client, launch.curve, launch.token, amountIn, address);
        if (plan.approval) {
          const approveHash = await ensureAllowance(client, walletClient, plan.approval.token, plan.approval.spender, plan.approval.amount);
          if (approveHash) {
            setMsg("Approving token spend…");
            await client.waitForTransactionReceipt({ hash: approveHash });
          }
        }
        const hash = await walletClient.sendTransaction({ account: address, to: plan.tx.to, data: plan.tx.data, value: plan.tx.value, chain: walletClient.chain });
        setMsg("Sell sent — waiting for confirmation…");
        await client.waitForTransactionReceipt({ hash });
        setMsg(`Sold ${launch.symbol} ✓`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 200) : "Trade failed");
    } finally {
      setBusy(false);
    }
  };

  if (status === null) return <p className="muted small">Reading curve state…</p>;
  if (status !== 1) {
    return (
      <p className="muted small">
        This curve is no longer live (status {status}
        {status === 3 ? " — graduated to a pool" : ""}). Trading moves to the pool after graduation.
      </p>
    );
  }

  return (
    <div className="trade">
      <div className="swap-toggle small">
        <button className={mode === "buy" ? "active" : ""} onClick={() => setMode("buy")}>Buy</button>
        <button className={mode === "sell" ? "active" : ""} onClick={() => setMode("sell")}>Sell</button>
      </div>
      <div className="trade-row">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.001" />
        <span className="muted">{mode === "buy" ? "ETH" : launch.symbol}</span>
        <button className="btn" onClick={trade} disabled={busy}>
          {!address ? "Connect" : busy ? "Confirm…" : mode === "buy" ? "Buy" : "Sell"}
        </button>
      </div>
      {quote && <p className="muted small">You receive ≈ {quote} (1% slippage)</p>}
      {msg && <p className="ok">{msg}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  );
}

export default function LaunchList() {
  const [items, setItems] = useState<LaunchItem[]>([]);
  const [mine, setMine] = useState<LaunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [span, setSpan] = useState(100_000n);

  const load = useCallback(async (blocks: bigint) => {
    setLoading(true);
    try {
      const found = await scanRecentLaunches(getPublicClient(), blocks);
      setItems(found);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMine(loadMyLaunches());
    void load(span);
  }, [load, span]);

  const merged: LaunchItem[] = [
    ...mine,
    ...items.filter((x) => !mine.some((m) => m.token.toLowerCase() === x.token.toLowerCase())),
  ];

  return (
    <section className="card">
      <div className="card-head">
        <h2>Recent launches</h2>
        <span className="pill">on-chain · auto-route factory</span>
      </div>
      <p className="muted">
        Tokens launched through the Ammora V4 factory, read live from chain events.
        Click a launch to trade it on its bonding curve. Your own launches on this
        device are kept at the top.
      </p>

      <div className="featured">
        <div>
          <b>$tAMM</b> <span className="muted">· the Season 2 token</span>
          <div className="mono small">{TAMM.token}</div>
        </div>
        <a className="btn" href="#swap">Swap $tAMM →</a>
      </div>

      {loading && <p className="muted">Scanning recent blocks for launches…</p>}
      {!loading && merged.length === 0 && (
        <p className="muted">No launches found in the scanned window. Be the first — <a href="/launch">create one</a>.</p>
      )}

      <ul className="launches">
        {merged.map((l) => (
          <li key={l.token}>
            <button className="launch-row" onClick={() => setOpen(open === l.token ? null : l.token)}>
              <span className="launch-name"><b>{l.name}</b> <span className="muted">${l.symbol}</span></span>
              <span className="mono small muted">token {short(l.token)} · curve {short(l.curve)}</span>
              <span className="muted small">by {shortAddr(l.creator as Address)} · config #{l.configId.toString()}</span>
              <span>{open === l.token ? "▾" : "▸"}</span>
            </button>
            {open === l.token && (
              <div className="launch-detail">
                <p className="mono small">
                  Token: {l.token}<br />Curve: {l.curve}
                </p>
                <p>
                  <a href={`${EXPLORER_URL}/tx/${l.txHash}`} target="_blank" rel="noreferrer">Launch tx ↗</a>
                </p>
                <TradePanel launch={l} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <button className="btn ghost" onClick={() => setSpan(span + 200_000n)} disabled={loading}>
        Scan further back (+200k blocks)
      </button>
    </section>
  );
}
