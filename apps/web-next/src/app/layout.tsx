import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { AuthProvider } from "@/auth/AuthProvider";
import { UserSettingsProvider } from "@/user-settings/UserSettingsProvider";
import { ConditionalNavbar } from "@/components/layout/ConditionalChrome";
import SkipLink from "@/components/ui/SkipLink";
import WebVitalsReporter from "@/components/ui/WebVitalsReporter";
import { OrganizationSchema, WebsiteSchema } from "@/components/seo/JsonLd";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

// Self-hosted via next/font: same families and the same four static weights
// the old Google Fonts <link> served, exposed as CSS variables so stylesheets
// keep their existing font stacks. Weights outside this list (e.g. Tailwind's
// font-extrabold) must keep resolving to 700, so do not switch these to the
// variable axis without auditing weight usage.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter-tight",
});

export const metadata: Metadata = {
  title: {
    default: "CreditOdds: Credit Card Approval Odds",
    template: "%s | CreditOdds",
  },
  description: "Real approval data from thousands of applications. Find the best card for every store, compare rewards, and follow card news from major issuers. Apply and spend smarter.",
  metadataBase: new URL("https://creditodds.com"),
  openGraph: {
    title: "CreditOdds: Credit Card Approval Odds",
    description: "Real approval data plus the best card for every store. Apply and spend smarter.",
    url: "https://creditodds.com",
    siteName: "CreditOdds",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@creditodds",
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
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <head>
        {/* Preconnect to external domains for faster loading */}
        <link rel="preconnect" href="https://d3ay3etzd1512y.cloudfront.net" />
        <link rel="preconnect" href="https://d2ojrhbh2dincr.cloudfront.net" />
        <link rel="dns-prefetch" href="https://d3ay3etzd1512y.cloudfront.net" />
        <link rel="dns-prefetch" href="https://d2ojrhbh2dincr.cloudfront.net" />
      </head>
      <body className="min-h-screen flex flex-col">
        <OrganizationSchema />
        <WebsiteSchema />
        <AuthProvider>
          <UserSettingsProvider>
            <SkipLink />
            <ConditionalNavbar />
            <main id="main-content" className="flex-grow">
              {children}
            </main>
            {/* Footer is rendered per-page via <V2Footer /> from
                @/components/landing-v2/Chrome — no global footer here. */}
            <ToastContainer />
            <WebVitalsReporter />
          </UserSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
