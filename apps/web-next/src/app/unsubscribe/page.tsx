import { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "Unsubscribed",
  description: "You have been unsubscribed from the CreditOdds newsletter.",
  robots: { index: false, follow: false },
  alternates: {
    canonical: "https://creditodds.com/unsubscribe",
  },
};

export default function UnsubscribePage() {
  return (
    <div className="landing-v2 static-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">Unsubscribe</span>
        </nav>
        <span className="cj-spacer" />
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">email · unsubscribe</div>
            <h1 className="cj-page-h1">
              You&apos;re <em className="cj-section-accent">unsubscribed.</em>
            </h1>
            <p className="cj-page-lede">
              You&apos;ve been removed from the CreditOdds newsletter and won&apos;t
              receive any more of these emails. You can keep using CreditOdds as
              normal, and you&apos;re welcome back on the list anytime.
            </p>
          </header>

          <p style={{ marginTop: "8px" }}>
            <a className="cj-cta-btn" href="https://creditodds.com">
              Back to CreditOdds
            </a>
          </p>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
