# GiwaPad — Exchange & Launchpad on GIWA Sepolia

A small exchange + launchpad built with the **Ammora SDK**
[`@ammora-protocol/sdk@0.3.9`](https://www.npmjs.com/package/@ammora-protocol/sdk),
for the Ammora Season 2 **Builder mission** ("Ship an exchange or launchpad with the Ammora SDK").

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
- **Recent launches** — read live from `LaunchCreated` events on the
  auto-route factory, plus your own launches saved on-device.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Connect MetaMask (or any EIP-1193 wallet); the app switches/adds GIWA Sepolia
automatically. Get test ETH at https://faucet.giwa.io/.

## Deploy to Vercel

1. Push this folder to a GitHub repo (e.g. `airdrop2026/giwapad`).
2. In Vercel: **Add New → Project → Import** the repo. Framework: Next.js (auto-detected).
3. No environment variables are required. Deploy.

That's it — `next build` output is a standard Next.js app; no server actions,
no database, no API keys.

## How it maps to the Builder mission

1. **Build with the SDK** — this repo (swap + launchpad, all trades built/planned
   with `@ammora-protocol/sdk` 0.3.9, viem for reads/writes).
2. **Post it on X** — post a demo video/screenshot from the X account linked
   to your Ammora waitlist wallet.
3. **Submit website link for review** — on
   https://ammora.org/waitlist#mission, "Submit your build": project name
   `GiwaPad`, website link = your Vercel URL, X post link = your post.

Reward is a bonus draw, not AP: 100 approved builders enter the draw for
$tAMM + SBT (amounts to be announced). The page lists no AP amount and no
deadline as of 2026-11-17.

## Verified live (2026-11-17)

- SDK 0.3.9: `giwaSepoliaAutoRouteDeployment` (factory
  `0x3535…68fA`, registry `0x6d04…0aF9`); 48 configs exist, #1–#12 all enabled,
  9 decimals, creation fee 0.
- $tAMM swap: curve `0x1FD8…978` status 3 (migrated), canonical pool
  `0x1EF9…Cf8`, quote 0.001 ETH → ~2.76 $tAMM; router `0x4FC9…496`.
- Recent launch found on-chain while building: EMP
  (`0xBFc7…f032`, config #30).

## Notes / limits

- The SDK's `AmmoraDataApiClient` (Data API at `ammora-giwa-sepolia-data.fly.dev`)
  was unreachable/flaky from the build environment, so launch discovery reads
  chain events directly instead of the indexer.
- Graduated curves (status 3) trade on their pool, not the curve — the in-app
  curve trader disables itself after graduation.
- `NEXT_PUBLIC_EXPLORER_URL` defaults to `https://sepolia.giwa.io`; override in
  Vercel env vars if the GIWA explorer lives elsewhere.
