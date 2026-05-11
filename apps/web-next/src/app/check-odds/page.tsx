import { Metadata } from "next";
import { Suspense } from "react";
import { BreadcrumbSchema } from "@/components/seo/JsonLd";
import { V2Footer } from "@/components/landing-v2/Chrome";
import CheckOddsClient from "./CheckOddsClient";
import "../landing.css";

export const metadata: Metadata = {
  title: "Check Your Odds",
  description: "Enter your credit profile and see your approval odds for every credit card, based on real data from thousands of past applications.",
  openGraph: {
    title: "Check Your Odds | CreditOdds",
    description: "Enter your credit profile and see your approval odds for every credit card, based on real data from thousands of past applications.",
    url: "https://creditodds.com/check-odds",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/check-odds",
  },
};

export default function CheckOddsPage() {
  return (
    <div className="landing-v2 check-v2">
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://creditodds.com' },
          { name: 'Check Your Odds', url: 'https://creditodds.com/check-odds' },
        ]}
      />
      <section className="page-hero wrap">
        <h1 className="page-title">
          Check your <em>odds.</em>
        </h1>
        <p className="page-sub">
          Enter your credit profile and see how you stack up against real approved
          applicants — before you take the hard pull.
        </p>
      </section>
      <div className="wrap" style={{ paddingTop: 8, paddingBottom: 64 }}>
        <Suspense>
          <CheckOddsClient />
        </Suspense>
      </div>
      <V2Footer />
    </div>
  );
}
