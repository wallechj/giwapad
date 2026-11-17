# GiwaPad — Exchange & Launchpad on GIWA Sepolia

A small exchange + launchpad built with the **Ammora SDK**
[`@ammora-protocol/sdk@0.3.9`](https://www.npmjs.com/package/@ammora-protocol/sdk).

Testnet only (GIWA Sepolia, chain 91342). No real funds. No backend, no secrets —
everything runs in the browser; writes are signed in the user's own wallet.

## What it does

- **Swap $tAMM (Exchange)** — live quotes from the Ammora bonding curve / V5 pool
  (the same route ammora.org uses), ETH ↔ $tAMM with 1% slippage. Buy uses the
  SDK's `buildV3NativePoolExactInput` / `buildV3NativeSourceExactInputBuy`;
  sell uses `buildV3PoolExactInputForNative`.
- **Launchpad** — create a token on an Ammora V4 bonding curve with
  `buildCreateAmmoraV4Launch` (config read live from the on-chain registry;
  creation is free, `poolCreationFee = 0`). Then buy/sell it on its curve
  (`AmmoraV4LaunchCurveClient` + `buildV3NativeSourceExactInputBuy` /
  `planSwapExactInput`).
  - **One-prompt launch** — describe the token in one sentence and the local
    idea generator (no API key) proposes name, symbol and description; pick one
    to launch.
- **Creator earnings** — your launches with graduation progress (raised vs
  target) and claimable WETH launch fees from Ammora's FeeVault, with a
  one-click claim (`buildClaimFeeVaultFor`).
- **Recent launches** — read live from `LaunchCreated` events on the
  auto-route factory, plus your own launches saved on-device.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Connect MetaMask (or any EIP-1193 wallet); the app switches/adds GIWA Sepolia
automatically. Get test ETH at https://faucet.giwa.io/.

## Notes

- The SDK's `AmmoraDataApiClient` (Data API at `ammora-giwa-sepolia-data.fly.dev`)
  was unreachable/flaky from the build environment, so launch discovery reads
  chain events directly instead of the indexer.
- Graduated curves (status 3) trade on their pool, not the curve — the in-app
  curve trader disables itself after graduation. Curve progress is read
  directly from the V4 pool (`quoteReserve` vs `migrationQuoteThreshold`).
- `NEXT_PUBLIC_EXPLORER_URL` defaults to `https://sepolia.giwa.io`; override it
  if the GIWA explorer lives elsewhere.
- Launch creation uses the SDK 0.3.9 "auto-route" V4 generation
  (factory `0x3535…68fA`, registry `0x6d04…0aF9`, FeeVault
  `0x414B…6800`); the $tAMM swap uses the legacy generation the Ammora site
  itself uses (curve `0x1FD8…978`, router `0x4FC9…496`).
