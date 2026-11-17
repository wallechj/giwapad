"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import {
  EXPLORER_URL,
  assertTxSuccess,
  buildCreateLaunchTx,
  buildMetadataURI,
  getPublicClient,
  listLaunchConfigs,
  parseCreatedLaunch,
  type LaunchConfig,
  type LaunchItem,
} from "../lib/ammora";
import { useWallet, shortAddr } from "../lib/wallet";
import PromptIdeas from "./PromptIdeas";

const MY_LAUNCHES_KEY = "giwapad:my-launches";

export function saveMyLaunch(item: LaunchItem) {
  try {
    const prev: LaunchItem[] = JSON.parse(localStorage.getItem(MY_LAUNCHES_KEY) || "[]");
    const next = [item, ...prev.filter((x) => x.token.toLowerCase() !== item.token.toLowerCase())];
    localStorage.setItem(MY_LAUNCHES_KEY, JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

export function loadMyLaunches(): LaunchItem[] {
  try {
    return JSON.parse(localStorage.getItem(MY_LAUNCHES_KEY) || "[]") as LaunchItem[];
  } catch {
    return [];
  }
}

export default function CreateLaunch() {
  const { address, walletClient, connect, connecting } = useWallet();
  const [configs, setConfigs] = useState<LaunchConfig[]>([]);
  const [configId, setConfigId] = useState<bigint>(6n);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchItem | null>(null);

  useEffect(() => {
    getPublicClient();
    listLaunchConfigs(getPublicClient())
      .then((c) => setConfigs(c.filter((x) => x.enabled)))
      .catch(() => setConfigs([]));
  }, []);

  const selected = configs.find((c) => c.id === configId);

  const submit = async () => {
    if (!address || !walletClient) { await connect(); return; }
    if (!name.trim() || !symbol.trim()) { setError("Name and symbol are required."); return; }
    if (!/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) { setError("Symbol: 1–10 letters/numbers."); return; }
    const cfg = selected;
    if (!cfg) { setError("Pick a launch config first."); return; }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const client = getPublicClient();
      const metadataURI = buildMetadataURI({ name: name.trim(), symbol: symbol.trim().toUpperCase(), description: description.trim() });
      const tx = buildCreateLaunchTx({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        tokenDecimals: cfg.tokenDecimals,
        configId: cfg.id,
        poolCreationFee: cfg.poolCreationFee,
        metadataURI,
      });
      const hash = await walletClient.sendTransaction({
        account: address, to: tx.to, data: tx.data, value: tx.value, chain: walletClient.chain,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      assertTxSuccess(receipt);
      const created = parseCreatedLaunch(receipt);
      const item: LaunchItem = {
        token: created.token as Address,
        curve: created.curve as Address,
        creator: address,
        configId: cfg.id,
        blockNumber: receipt.blockNumber,
        txHash: hash,
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
      };
      saveMyLaunch(item);
      setResult(item);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 240) : "Launch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Launch a token</h2>
        <span className="pill">Ammora SDK · V4 bonding curve</span>
      </div>
      <p className="muted">
        Issue a new token on an Ammora bonding curve (ALC). The launchpad Config
        sets the curve, fees and graduation rules — creating the Config needs no
        Ammora approval, and the launch itself costs no creation fee
        (poolCreationFee = 0 on the verified configs below).
      </p>

      <PromptIdeas onPick={(idea) => { setName(idea.name); setSymbol(idea.symbol); setDescription(idea.description); }} />

      <label className="field">
        <span>Token name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Giwa Cat" maxLength={32} />
      </label>
      <label className="field">
        <span>Symbol</span>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. GCAT" maxLength={10} />
      </label>
      <label className="field">
        <span>Description (stored in the token metadata)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token for?" maxLength={200} />
      </label>
      <label className="field">
        <span>Launch config</span>
        <select value={configId.toString()} onChange={(e) => setConfigId(BigInt(e.target.value))}>
          {configs.length === 0 && <option value="6">Config #6 (loading…)</option>}
          {configs.map((c) => (
            <option key={c.id.toString()} value={c.id.toString()}>
              Config #{c.id.toString()} · {c.tokenDecimals} decimals · {c.segments} segment{c.segments === 1 ? "" : "s"} · fee {c.poolCreationFee.toString()} wei
            </option>
          ))}
        </select>
        <small>Read live from the on-chain Config registry. Config #6 is the example default from the Ammora launchpad guide.</small>
      </label>

      <button className="btn primary" onClick={submit} disabled={busy || connecting}>
        {!address ? "Connect wallet to launch" : busy ? "Confirm in wallet…" : "Create launch"}
      </button>
      {address && <p className="muted small">Creator: {shortAddr(address as Address)} · you keep the creator role for this token.</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result">
          <h3>🎉 Launched!</h3>
          <p><b>{result.name} ({result.symbol})</b></p>
          <p className="mono small">Token: {result.token}</p>
          <p className="mono small">Curve: {result.curve}</p>
          <p>
            <a href={`${EXPLORER_URL}/tx/${result.txHash}`} target="_blank" rel="noreferrer">View launch tx ↗</a>
            {" · "}
            <a href="/">Trade it on the home page →</a>
          </p>
          <p className="muted small">It now appears in “Recent launches” below, and in your own list on this device.</p>
        </div>
      )}
    </section>
  );
}
