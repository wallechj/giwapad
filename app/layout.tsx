import type { Metadata } from "next";
import Header, { WalletError } from "../components/Header";
import { WalletProvider } from "../lib/wallet";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiwaPad — Exchange & Launchpad on GIWA Sepolia",
  description: "Swap $tAMM and launch tokens on bonding curves, built with the Ammora SDK (@ammora-protocol/sdk) on GIWA Sepolia testnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Header />
          <WalletError />
          <main className="main">{children}</main>
          <footer className="footer">
            <p>
              GiwaPad — exchange &amp; launchpad on <b>GIWA Sepolia (chain 91342)</b>, built with{" "}
              <a href="https://www.npmjs.com/package/@ammora-protocol/sdk" target="_blank" rel="noreferrer">@ammora-protocol/sdk 0.3.9</a>.
              Testnet only — no real funds. Get test ETH at{" "}
              <a href="https://faucet.giwa.io/" target="_blank" rel="noreferrer">faucet.giwa.io</a>.
            </p>
            <p className="muted small">
              Not affiliated with Ammora. Swap quotes come from Ammora contracts; launches are created
              through the reviewed Ammora V4 factory. Always verify transactions in your wallet before signing.
            </p>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
