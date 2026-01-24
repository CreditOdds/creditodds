import type { Metadata } from "next";
import { AuthProvider } from "@/auth/AuthProvider";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CreditOdds: Credit Card Approval Odds",
    template: "%s | CreditOdds",
  },
  description: "Explore what it takes to get approved for credit cards. See user-reported approval data.",
  metadataBase: new URL("https://creditodds.com"),
  openGraph: {
    title: "CreditOdds: Credit Card Approval Odds",
    description: "Explore what it takes to get approved for credit cards",
    url: "https://creditodds.com",
    siteName: "CreditOdds",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
          <ToastContainer />
        </AuthProvider>
      </body>
    </html>
  );
}
