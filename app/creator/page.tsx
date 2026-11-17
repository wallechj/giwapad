import CreatorDashboard from "../../components/CreatorDashboard";

export default function CreatorPage() {
  return (
    <>
      <section className="hero compact">
        <h1>Creator earnings</h1>
        <p>
          Your launches, their graduation progress, and the trading fees you can claim.
          Fees settle in WETH in Ammora&apos;s FeeVault — one click to claim.
        </p>
      </section>
      <CreatorDashboard />
    </>
  );
}
