import CreateLaunch from "../../components/CreateLaunch";

export default function LaunchPage() {
  return (
    <>
      <section className="hero compact">
        <h1>Launchpad</h1>
        <p>
          Create a token on an Ammora V4 bonding curve. Traders buy it on the curve;
          when the curve fills, it graduates to a pool. Your token, your creator role.
        </p>
        <ol className="steps">
          <li><b>1.</b> Describe your token in one sentence — or fill in the name and symbol by hand.</li>
          <li><b>2.</b> Pick a launch config — it sets the curve, fees and graduation rules.</li>
          <li><b>3.</b> Sign the launch transaction (free — no creation fee), then track your fees on the Creator page.</li>
        </ol>
      </section>
      <CreateLaunch />
    </>
  );
}
