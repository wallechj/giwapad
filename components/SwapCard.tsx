"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther, type Address } from "viem";
import {
  EXPLORER_URL,
  TAMM,
  assertTxSuccess,
  buildTammBuyTx,
  buildTammSellTx,
  ensureAllowance,
  fmtTamm,
  getPublicClient,
  getTammRoute,
  parseEth,
  parseTamm,
  quoteTamm,
  tokenBalance,
} from "../lib/ammora";
import { useWallet, shortAddr } from "../lib/wallet";

type Status = { kind: "idle" | "quoting" | "ready" | "sending" | "done" | "error"; msg?: string; tx?: string };

export default function SwapCard() {
  const { address, walletClient, connect, connecting } = useWallet();
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.001");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [via, setVia] = useState<string>("");
  const [curveStatus, setCurveStatus] = useState<number | null>(null);
  const [ethBal, setEthBal] = useState<string>("-");
  const [tammBal, setTammBal] = useState<string>("-");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!address) return;
    const client = getPublicClient();
    const eth = await client.getBalance({ address });
    setEthBal(formatEther(eth));
    setTammBal(await tokenBalance(client, TAMM.token, address, TAMM.decimals));
  }, [address]);

  useEffect(() => {
    void refreshBalances();
    const client = getPublicClient();
    getTammRoute(client).then((r) => setCurveStatus(r.status)).catch(() => undefined);
  }, [refreshBalances]);

  useEffect(() => {
    setQuote(null);
    setStatus({ kind: "idle" });
    if (!amount || Number(amount) <= 0) return;
    setStatus({ kind: "quoting", msg: "Fetching live quote…" });
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      try {
        const client = getPublicClient();
        const amountIn = direction === "buy" ? parseEth(amount) : parseTamm(amount);
        const q = await quoteTamm(client, amountIn, direction);
        setQuote(q.amountOut);
        setVia(q.via === "pool" ? "V5 pool" : "bonding curve");
        setStatus({ kind: "ready" });
      } catch (e) {
        setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Quote failed" });
      }
    }, 400);
    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
  }, [amount, direction]);

  const doSwap = async () => {
    if (!address || !walletClient) { await connect(); return; }
    if (!quote || Number(amount) <= 0) return;
    const client = getPublicClient();
    setStatus({ kind: "sending", msg: "Waiting for wallet signature…" });
    try {
      let hash: string;
      if (direction === "buy") {
        const tx = await buildTammBuyTx(client, parseEth(amount), address);
        hash = await walletClient.sendTransaction({ account: address, to: tx.to, data: tx.data, value: tx.value, chain: walletClient.chain });
      } else {
        const amountIn = parseTamm(amount);
        const approveHash = await ensureAllowance(client, walletClient, TAMM.token, TAMM.router, amountIn, address);
        if (approveHash) {
          setStatus({ kind: "sending", msg: "Approving $tAMM spend… confirm in wallet, then wait" });
          assertTxSuccess(await client.waitForTransactionReceipt({ hash: approveHash }));
        }
        const tx = await buildTammSellTx(client, amountIn, address);
        hash = await walletClient.sendTransaction({ account: address, to: tx.to, data: tx.data, value: tx.value, chain: walletClient.chain });
      }
      setStatus({ kind: "sending", msg: "Transaction sent — waiting for confirmation…" });
      assertTxSuccess(await client.waitForTransactionReceipt({ hash: hash as `0x${string}` }));
      setStatus({ kind: "done", msg: direction === "buy" ? "Swap complete — $tAMM received." : "Swap complete — ETH received.", tx: hash });
      void refreshBalances();
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message.slice(0, 200) : "Swap failed" });
    }
  };

  const inLabel = direction === "buy" ? "You pay (ETH)" : "You pay ($tAMM)";
  const outLabel = direction === "buy" ? "You receive ($tAMM)" : "You receive (ETH)";

  return (
    <section className="card">
      <div className="card-head">
        <h2>Swap $tAMM</h2>
        <span className="pill">GIWA Sepolia · live quote</span>
      </div>
      <p className="muted">
        Exchange ETH ↔ $tAMM through the Ammora router. Quotes are read live from the
        bonding curve / V5 pool — the same route ammora.org uses.
        {curveStatus !== null && <> Curve status: <b>{curveStatus === 3 ? "migrated to V5 pool" : curveStatus === 1 ? "live curve" : curveStatus}</b>.</>}
      </p>

      <div className="swap-toggle">
        <button className={direction === "buy" ? "active" : ""} onClick={() => setDirection("buy")}>Buy $tAMM</button>
        <button className={direction === "sell" ? "active" : ""} onClick={() => setDirection("sell")}>Sell $tAMM</button>
      </div>

      <label className="field">
        <span>{inLabel}</span>
        <input
          inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.001"
        />
        <small>Balance: {direction === "buy" ? `${ethBal} ETH` : `${tammBal} $tAMM`}</small>
      </label>

      <div className="quote-row">
        <span>{outLabel}</span>
        <strong>
          {quote === null ? "—" : direction === "buy" ? `${fmtTamm(quote)} $tAMM` : `${formatEther(quote)} ETH`}
        </strong>
      </div>
      <p className="muted small">
        {via ? `Quoted via ${via} · ` : ""}1% slippage · 10 min deadline · no fee taken by GiwaPad
      </p>

      <button className="btn primary" onClick={doSwap} disabled={connecting || status.kind === "sending" || status.kind === "quoting"}>
        {!address ? "Connect wallet to swap" : status.kind === "sending" ? "Confirm in wallet…" : `Swap ${direction === "buy" ? "ETH → $tAMM" : "$tAMM → ETH"}`}
      </button>

      {address && <p className="muted small">Connected: {shortAddr(address as Address)}</p>}
      {status.kind === "quoting" && <p className="muted">{status.msg}</p>}
      {status.kind === "error" && <p className="error">{status.msg}</p>}
      {status.kind === "done" && (
        <p className="ok">
          {status.msg}{" "}
          {status.tx && <a href={`${EXPLORER_URL}/tx/${status.tx}`} target="_blank" rel="noreferrer">View tx ↗</a>}
        </p>
      )}
      {status.kind === "sending" && <p className="muted">{status.msg}</p>}
    </section>
  );
}
