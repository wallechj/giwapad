/**
 * GiwaPad core: Ammora SDK wiring for GIWA Sepolia (chain 91342).
 *
 * Two generations are used, both from the SDK's own reviewed catalog:
 *  - $tAMM exchange: the legacy generation that ammora.org itself uses
 *    (curve 0x1FD8… / NativeRouter 0x4FC9…). Addresses below were read live
 *    from the Season 2 page's `state` on 2026-11-17 and are re-checked
 *    on-chain at runtime (curve status + canonical pool).
 *  - Launchpad: the SDK 0.3.9 "auto-route" V4 generation
 *    (`giwaSepoliaAutoRouteDeployment`), the path in the official
 *    LAUNCHPAD.md guide. Config creation is free (poolCreationFee = 0).
 */
import {
  AmmoraV4LaunchCurveClient,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
  buildClaimFeeVaultFor,
  buildCreateAmmoraV4Launch,
  buildV3NativePoolExactInput,
  buildV3NativeSourceExactInputBuy,
  buildV3PoolExactInputForNative,
  feeVaultAbi,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4NextConfigId,
  giwaSepoliaAutoRouteDeployment,
  parseAmmoraV4LaunchCreatedReceipt,
} from "@ammora-protocol/sdk";
import {
  createPublicClient,
  defineChain,
  erc20Abi,
  formatUnits,
  http,
  parseAbiItem,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

export const CHAIN_ID = 91342;
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia-rpc.giwa.io";
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://sepolia.giwa.io";

export const giwaSepolia = defineChain({
  id: CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: giwaSepolia, transport: http(RPC_URL) });
}

// ---------------------------------------------------------------- $tAMM
export const TAMM = {
  token: "0x10B3Cc2fc981277Ada576891CF649D0ABA768B06" as Address,
  curve: "0x1FD82a1BeAff168BdeFC790EB0f1A50f7C53b978" as Address,
  router: "0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
  decimals: 6,
} as const;

// ------------------------------------------------------- launchpad (auto-route)
export const LAUNCH = giwaSepoliaAutoRouteDeployment.contracts.launch;
export const LAUNCH_CORE = {
  configRegistry: LAUNCH.configRegistry,
  launchFactory: LAUNCH.factory,
  graduationAdapter: LAUNCH.graduationAdapter,
  feePolicy: LAUNCH.feePolicy,
} as const;

export const ZERO = zeroAddress;
export const SLIPPAGE_BPS = 100; // 1%
export const DEADLINE_SECONDS = 600;

export const deadline = () =>
  BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
export const minOut = (amountOut: bigint) =>
  (amountOut * BigInt(10_000 - SLIPPAGE_BPS)) / 10_000n || 1n;

// Minimal ABIs (verified against the live contracts on 2026-11-17)
export const CURVE_ABI = [
  { type: "function", name: "status", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "canonicalPool", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function", name: "quoteExactInput", stateMutability: "view",
    inputs: [{ name: "includedAmountIn", type: "uint256" }, { name: "baseForQuote", type: "bool" }],
    outputs: [
      { name: "result", type: "tuple", components: [{ name: "amountIn", type: "uint256" }, { name: "amountOut", type: "uint256" }, { name: "amountLeft", type: "uint256" }, { name: "nextSqrtPrice", type: "uint128" }] },
      { name: "fee", type: "uint256" },
    ],
  },
] as const;

export const POOL_ABI = [
  { type: "function", name: "quoteExactIn", stateMutability: "view", inputs: [{ name: "tokenIn", type: "address" }, { name: "amountIn", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

export const WETH_ABI = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "wad", type: "uint256" }], outputs: [] },
] as const;

// ------------------------------------------------------------------ types
export type LaunchConfig = {
  id: bigint;
  enabled: boolean;
  tokenDecimals: number;
  poolCreationFee: bigint;
  segments: number;
  configHash: Hex;
};

export type LaunchItem = {
  token: Address;
  curve: Address;
  creator: Address;
  configId: bigint;
  blockNumber: bigint;
  txHash: Hex;
  name: string;
  symbol: string;
  image?: string;
};

// ------------------------------------------------------------ $tAMM exchange
export async function getTammRoute(client: PublicClient) {
  const status = await client.readContract({
    address: TAMM.curve, abi: CURVE_ABI, functionName: "status",
  });
  const pool = await client.readContract({
    address: TAMM.curve, abi: CURVE_ABI, functionName: "canonicalPool",
  });
  return { status, pool };
}

/** Live quote for ETH -> $tAMM (buy) or $tAMM -> ETH (sell). */
export async function quoteTamm(
  client: PublicClient,
  amountIn: bigint,
  direction: "buy" | "sell",
): Promise<{ amountOut: bigint; via: "pool" | "curve" }> {
  const { status, pool } = await getTammRoute(client);
  if (status === 3 && pool !== ZERO) {
    const out = await client.readContract({
      address: pool, abi: POOL_ABI, functionName: "quoteExactIn",
      args: [direction === "buy" ? TAMM.weth : TAMM.token, amountIn],
    });
    return { amountOut: out, via: "pool" };
  }
  if (status === 1) {
    // Pre-migration curve: quote on the curve itself.
    const [q] = await client.readContract({
      address: TAMM.curve, abi: CURVE_ABI, functionName: "quoteExactInput",
      args: [amountIn, direction === "sell"],
    });
    return { amountOut: q.amountOut, via: "curve" };
  }
  throw new Error(`$tAMM curve status ${status} is not tradable right now`);
}

export async function buildTammBuyTx(
  client: PublicClient,
  amountInWei: bigint,
  recipient: Address,
): Promise<{ to: Address; data: Hex; value: bigint }> {
  const { status, pool } = await getTammRoute(client);
  if (status === 3 && pool !== ZERO) {
    const { amountOut } = await quoteTamm(client, amountInWei, "buy");
    const tx = buildV3NativePoolExactInput(
      pool, amountInWei, minOut(amountOut), recipient, deadline(), ZERO,
    );
    return { to: TAMM.router, data: tx.data, value: tx.value };
  }
  if (status === 1) {
    const { amountOut } = await quoteTamm(client, amountInWei, "buy");
    const tx = buildV3NativeSourceExactInputBuy(
      // sourceFactory for the legacy generation is the launch factory
      // ammora.org uses (0xd83C…); the router calldata is identical.
      "0xd83Cb1c28e6BE6e38e7178541f6C9343500446ac" as Address,
      TAMM.curve, amountInWei, minOut(amountOut), false, recipient, deadline(), ZERO,
    );
    return { to: TAMM.router, data: tx.data, value: tx.value };
  }
  throw new Error(`$tAMM curve status ${status} is not tradable right now`);
}

export async function buildTammSellTx(
  client: PublicClient,
  amountInTamm: bigint,
  recipient: Address,
): Promise<{ to: Address; data: Hex; value: bigint }> {
  const { amountOut } = await quoteTamm(client, amountInTamm, "sell");
  const tx = buildV3PoolExactInputForNative(
    (await getTammRoute(client)).pool,
    TAMM.token, amountInTamm, minOut(amountOut), recipient, deadline(), ZERO,
  );
  return { to: TAMM.router, data: tx.data, value: 0n };
}

export async function tokenBalance(
  client: PublicClient, token: Address, wallet: Address, decimals: number,
): Promise<string> {
  const bal = await client.readContract({
    address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet],
  });
  return formatUnits(bal, decimals);
}

export async function ensureAllowance(
  client: PublicClient,
  walletClient: WalletClient,
  token: Address, spender: Address, amount: bigint,
): Promise<Hex | null> {
  const account = walletClient.account;
  if (!account) throw new Error("Wallet not connected");
  const allowance = await client.readContract({
    address: token, abi: erc20Abi, functionName: "allowance",
    args: [account.address, spender],
  });
  if (allowance >= amount) return null;
  return walletClient.writeContract({
    address: token, abi: erc20Abi, functionName: "approve",
    args: [spender, amount], account, chain: giwaSepolia,
  });
}

// --------------------------------------------------------------- launchpad
export async function listLaunchConfigs(
  client: PublicClient, maxId = 12,
): Promise<LaunchConfig[]> {
  const block = await client.getBlockNumber();
  const next = await getAmmoraV4NextConfigId(client, LAUNCH.configRegistry, block);
  const ids: bigint[] = [];
  for (let id = 1n; id < next && id <= BigInt(maxId); id++) ids.push(id);
  const out: LaunchConfig[] = [];
  for (const id of ids) {
    try {
      const e = await getAmmoraV4ConfigAtBlock(client, LAUNCH.configRegistry, id, block);
      out.push({
        id, enabled: e.enabled,
        tokenDecimals: e.config.tokenDecimals,
        poolCreationFee: e.config.poolCreationFee,
        segments: e.segments.length,
        configHash: e.configHash,
      });
    } catch {
      // skip unreadable configs
    }
  }
  return out;
}

export function buildMetadataURI(input: {
  name: string; symbol: string; description?: string; image?: string;
}): string {
  const json = JSON.stringify({
    name: input.name,
    symbol: input.symbol,
    description: input.description || `${input.name} (${input.symbol}) — launched on GiwaPad with the Ammora SDK.`,
    image: input.image || "",
  });
  return `data:application/json;utf8,${encodeURIComponent(json)}`;
}

export function buildCreateLaunchTx(input: {
  name: string; symbol: string; tokenDecimals: number;
  configId: bigint; poolCreationFee: bigint; metadataURI: string;
}): { to: Address; data: Hex; value: bigint } {
  const tx = buildCreateAmmoraV4Launch(
    {
      name: input.name,
      symbol: input.symbol,
      metadataURI: input.metadataURI,
      creatorMetadataURI: input.metadataURI,
      tokenDecimals: input.tokenDecimals,
    },
    input.configId,
    input.poolCreationFee,
  );
  return { to: LAUNCH.factory, data: tx.data, value: tx.value ?? 0n };
}

export function parseCreatedLaunch(receipt: TransactionReceipt) {
  return parseAmmoraV4LaunchCreatedReceipt(receipt, LAUNCH.factory);
}

// ------------------------------------------------------- launches discovery
const LAUNCH_CREATED_EVENT = parseAbiItem(
  "event LaunchCreated(address indexed token, address indexed curve, address indexed creator, uint256 configId, bytes32 configHash, uint16 protocolVersion, string metadataURI)",
);

function parseLaunchMetadata(uri: string): { name: string; symbol: string; image?: string } {
  try {
    const raw = uri.startsWith("data:") ? decodeURIComponent(uri.split(",", 2)[1] ?? "") : uri;
    const j = JSON.parse(raw) as { name?: string; symbol?: string; image?: string };
    return { name: j.name || "Unnamed", symbol: j.symbol || "???", image: j.image };
  } catch {
    return { name: "Unnamed", symbol: "???" };
  }
}

/** Fill in name/symbol from the token contract itself for launches whose
 * event metadata is missing or unparseable (most launches made outside
 * GiwaPad carry an empty metadataURI, which is why they showed as
 * "Unnamed $???"). The factory mints the token with the given name/symbol,
 * so the on-chain values are authoritative. No multicall on GIWA Sepolia
 * (multicall3 is not deployed there), so reads run in small batches. */
async function enrichLaunchNames(
  client: PublicClient, items: LaunchItem[],
): Promise<void> {
  const missing = items.filter(
    (i) => i.name === "Unnamed" || i.symbol === "???",
  );
  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(
      missing.slice(i, i + BATCH).map(async (item) => {
        try {
          const [name, symbol] = await Promise.all([
            client.readContract({ address: item.token, abi: erc20Abi, functionName: "name" }),
            client.readContract({ address: item.token, abi: erc20Abi, functionName: "symbol" }),
          ]);
          if (name) item.name = name;
          if (symbol) item.symbol = symbol;
        } catch {
          // keep the metadata fallback ("Unnamed $???")
        }
      }),
    );
  }
}

/** Scan recent LaunchCreated events on the auto-route factory (10k-block chunks). */
export async function scanRecentLaunches(
  client: PublicClient, spanBlocks = 100_000n, chunk = 10_000n,
): Promise<LaunchItem[]> {
  const head = await client.getBlockNumber();
  const from = head > spanBlocks ? head - spanBlocks : 0n;
  const items: LaunchItem[] = [];
  for (let start = from; start <= head; start += chunk) {
    const end = start + chunk - 1n > head ? head : start + chunk - 1n;
    try {
      const logs = await client.getLogs({
        address: LAUNCH.factory, event: LAUNCH_CREATED_EVENT,
        fromBlock: start, toBlock: end,
      });
      for (const log of logs) {
        const a = log.args;
        if (!a.token || !a.curve || !a.creator) continue;
        const meta = parseLaunchMetadata(a.metadataURI ?? "");
        items.push({
          token: a.token, curve: a.curve, creator: a.creator,
          configId: a.configId ?? 0n, blockNumber: log.blockNumber,
          txHash: log.transactionHash, ...meta,
        });
      }
    } catch {
      // RPC range limits: skip this chunk, keep what we have
    }
  }
  const found = items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  await enrichLaunchNames(client, found);
  return found;
}

// ---------------------------------------------------------- curve trading
export async function getCurveState(client: PublicClient, curve: Address) {
  const status = await client.readContract({
    address: curve, abi: CURVE_ABI, functionName: "status",
  });
  const pool = await client.readContract({
    address: curve, abi: CURVE_ABI, functionName: "canonicalPool",
  });
  return { status, pool };
}

/** Quote buying base tokens on a live curve with native ETH. */
export async function quoteCurveBuy(
  client: PublicClient, curve: Address, amountInWei: bigint,
): Promise<bigint> {
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, LAUNCH_CORE);
  const q = await sdk.quoteExactInput(amountInWei, false);
  return q.amountOut;
}

export async function buildCurveBuyTx(
  client: PublicClient, curve: Address, amountInWei: bigint, recipient: Address,
): Promise<{ to: Address; data: Hex; value: bigint }> {
  const amountOut = await quoteCurveBuy(client, curve, amountInWei);
  const tx = buildV3NativeSourceExactInputBuy(
    LAUNCH.factory, curve, amountInWei, minOut(amountOut), false,
    recipient, deadline(), ZERO,
  );
  return { to: TAMM.router, data: tx.data, value: tx.value };
}

/** Sell base tokens on a live curve; returns approval (if needed) + swap tx. */
export async function planCurveSell(
  client: PublicClient, curve: Address, token: Address,
  amountInBase: bigint, recipient: Address,
): Promise<{
  approval: { token: Address; spender: Address; amount: bigint } | null;
  tx: { to: Address; data: Hex; value: bigint };
  amountOut: bigint;
}> {
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, LAUNCH_CORE);
  const plan = await sdk.planSwapExactInput({
    includedAmountIn: amountInBase, baseForQuote: true,
    allowPartialFill: false, slippageBps: SLIPPAGE_BPS,
    recipient, deadline: deadline(),
  });
  const req = plan.approvalRequirements?.[0];
  return {
    approval: req ? { token: req.token as Address, spender: req.spender as Address, amount: req.amount } : null,
    tx: { to: plan.transaction.to as Address, data: plan.transaction.data as Hex, value: 0n },
    amountOut: plan.quote.amountOut,
  };
}

export const fmtEth = (wei: bigint) => formatUnits(wei, 18);
export const parseEth = (s: string) => parseUnits(s, 18);
export const fmtTamm = (raw: bigint) => formatUnits(raw, TAMM.decimals);
export const parseTamm = (s: string) => parseUnits(s, TAMM.decimals);

// ------------------------------------------------- creator earnings (FeeVault)
export const FEE_VAULT_FALLBACK =
  "0x414Be4a093fDFd7292dCa95C4D6fdD3905Ee6800" as Address; // verified live 2026-11-17

/** The factory names its own fee vault; creator + partner fees settle there. */
export async function getFeeVault(client: PublicClient): Promise<Address> {
  try {
    return await client.readContract({
      address: LAUNCH.factory, abi: ammoraLaunchFactoryV4Abi, functionName: "feeVault",
    });
  } catch {
    return FEE_VAULT_FALLBACK;
  }
}

/** Fees owed to a beneficiary for one fee token (launch fees settle in WETH). */
export async function getClaimable(
  client: PublicClient, vault: Address, token: Address, beneficiary: Address,
): Promise<bigint> {
  return client.readContract({
    address: vault, abi: feeVaultAbi, functionName: "claimable",
    args: [token, beneficiary],
  });
}

/** Claim tx for the connected wallet; send it to the fee vault. */
export function buildClaimFeeTx(
  token: Address, beneficiary: Address, recipient: Address,
): { data: Hex } {
  return buildClaimFeeVaultFor(token, beneficiary, recipient);
}

/**
 * Graduation progress of a live curve: raised (quoteReserve) vs the migration
 * threshold, in WETH wei. Read directly from the V4 pool — the SDK's
 * ALCClient.getMigrationProgress() reverts on these curves (it calls
 * protocolLiquidityMigrationFeeBps() on the curve itself), so we don't use it.
 */
export async function getMigrationProgress(client: PublicClient, curve: Address) {
  const [status, canonicalPool, quoteReserve, migrationQuoteThreshold] = await Promise.all([
    client.readContract({ address: curve, abi: ammoraLaunchPoolV4Abi, functionName: "status" }),
    client.readContract({ address: curve, abi: ammoraLaunchPoolV4Abi, functionName: "canonicalPool" }),
    client.readContract({ address: curve, abi: ammoraLaunchPoolV4Abi, functionName: "quoteReserve" }),
    client.readContract({ address: curve, abi: ammoraLaunchPoolV4Abi, functionName: "migrationQuoteThreshold" }),
  ]);
  const progressBps = migrationQuoteThreshold > 0n
    ? Number((quoteReserve * 10_000n) / migrationQuoteThreshold)
    : 0;
  return {
    status, ready: progressBps >= 10_000, migrated: status === 3,
    usesQuoteThreshold: true, current: quoteReserve, target: migrationQuoteThreshold,
    progressBps, canonicalPool,
  };
}
