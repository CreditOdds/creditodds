import Link from "next/link";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "./landing.css";

export default function NotFound() {
  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <h1 className="page-title">
          This page doesn&apos;t <em>exist.</em>
        </h1>
        <p className="page-sub">
          Either the page moved, the card got renamed, or we never had this one. Try
          exploring from one of these instead.
        </p>
      </section>
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 64 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
          }}
        >
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 8,
              background: 'var(--ink)',
              color: 'var(--paper)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            ← Home
          </Link>
          <Link
            href="/explore"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--line-2)',
              background: 'var(--card)',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            Explore cards
          </Link>
          <Link
            href="/check-odds"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--line-2)',
              background: 'var(--card)',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            Check your odds
          </Link>
          <Link
            href="/news"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid var(--line-2)',
              background: 'var(--card)',
              color: 'var(--ink)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            Card news
          </Link>
        </div>
      </div>
      <V2Footer />
    </div>
  );
}
