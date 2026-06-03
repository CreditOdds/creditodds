import WalletHistoryClient from "./WalletHistoryClient";

export const metadata = {
  title: "Wallet history",
  robots: { index: false, follow: false },
};

export default function WalletHistoryPage() {
  return <WalletHistoryClient />;
}
