import Link from "next/link";
import SwapCard from "../components/SwapCard";
import LaunchList from "../components/LaunchList";

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Trade $tAMM. Launch the next one.</h1>
        <p>
          GiwaPad is a small exchange &amp; launchpad on GIWA Sepolia, built with the{" "}
          <a href="https://www.npmjs.com/package/@ammora-protocol/sdk" target="_blank" rel="noreferrer">Ammora SDK</a>.
          Swap ETH ↔ $tAMM through the Ammora router, or issue your own token on an
          Ammora bonding curve — no creation fee, no approval needed.
        </p>
        <div className="hero-cta">
          <a className="btn primary" href="#swap">Swap $tAMM</a>
          <Link className="btn" href="/launch">Launch a token →</Link>
        </div>
        <p className="muted small">
          Testnet only. You need GIWA Sepolia ETH — get some at{" "}
          <a href="https://faucet.giwa.io/" target="_blank" rel="noreferrer">faucet.giwa.io</a>.
        </p>
      </section>

      <div id="swap">
        <SwapCard />
      </div>
      <LaunchList />
    </>
  );
}
