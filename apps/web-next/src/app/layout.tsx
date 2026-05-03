import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/auth/AuthProvider";
import { ConditionalNavbar } from "@/components/layout/ConditionalChrome";
import SkipLink from "@/components/ui/SkipLink";
import WebVitalsReporter from "@/components/ui/WebVitalsReporter";
import LogRocketInit from "@/components/ui/LogRocketInit";
import DataPointPrompt from "@/components/ui/DataPointPrompt";
import { OrganizationSchema, WebsiteSchema } from "@/components/seo/JsonLd";
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
  twitter: {
    card: "summary_large_image",
    creator: "@MaxwellMelcher",
  },
  authors: [{ name: "Maxwell Melcher" }],
  creator: "Maxwell Melcher",
  keywords: ["credit card", "approval odds", "credit score", "credit cards", "approval rate"],
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to external domains for faster loading */}
        <link rel="preconnect" href="https://d3ay3etzd1512y.cloudfront.net" />
        <link rel="preconnect" href="https://d2ojrhbh2dincr.cloudfront.net" />
        <link rel="dns-prefetch" href="https://d3ay3etzd1512y.cloudfront.net" />
        <link rel="dns-prefetch" href="https://d2ojrhbh2dincr.cloudfront.net" />
        {/* Landing v2 fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <OrganizationSchema />
        <WebsiteSchema />
        <AuthProvider>
          <SkipLink />
          <ConditionalNavbar />
          <main id="main-content" className="flex-grow">
            {children}
            <DataPointPrompt />
          </main>
          {/* Footer is rendered per-page via <V2Footer /> from
              @/components/landing-v2/Chrome — no global footer here. */}
          <ToastContainer />
          <WebVitalsReporter />
          <LogRocketInit />
        </AuthProvider>
      </body>
    </html>
  );
}
