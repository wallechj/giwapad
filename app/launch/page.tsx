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
          <li><b>1.</b> Pick a launch config — it sets the curve, fees and graduation rules.</li>
          <li><b>2.</b> Name your token and sign the launch transaction (free — no creation fee).</li>
          <li><b>3.</b> Share it: post the token on X and trade it from the home page.</li>
        </ol>
      </section>
      <CreateLaunch />
    </>
  );
}
