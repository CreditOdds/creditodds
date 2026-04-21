'use client';

import Link from 'next/link';
import Image from 'next/image';

export function V2Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div style={{ marginBottom: 14 }}>
              <Image
                src="/assets/CreditOdds_LogoText_white-01.svg"
                alt="CreditOdds"
                width={160}
                height={40}
              />
            </div>
            <p
              style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                lineHeight: 1.55,
                maxWidth: 320,
              }}
            >
              Community-powered approval odds for 140+ credit cards. Independent, free,
              and built on real data.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <Link href="/explore">Explore cards</Link>
            <Link href="/check-odds">Check odds</Link>
            <Link href="/best">Best cards</Link>
            <Link href="/news">Card news</Link>
          </div>
          <div>
            <h4>Community</h4>
            <Link href="/articles">Articles</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <a
              href="https://twitter.com/MaxwellMelcher"
              target="_blank"
              rel="noreferrer"
            >
              X / Twitter
            </a>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/about">About</Link>
            <Link href="/how">How it works</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} CreditOdds. Built by the community.</span>
          <span>v2.6 · Last updated Apr 2026</span>
        </div>
      </div>
    </footer>
  );
}
