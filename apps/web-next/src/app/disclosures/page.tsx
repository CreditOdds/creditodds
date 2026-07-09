import { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "Affiliate Disclosures",
  description:
    "How CreditOdds makes money, and our promise that affiliate relationships never affect how we rank or which cards we show.",
  openGraph: {
    title: "Affiliate Disclosures | CreditOdds",
    description:
      "How CreditOdds makes money, and our promise that affiliate relationships never affect how we rank or which cards we show.",
    url: "https://creditodds.com/disclosures",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/disclosures",
  },
};

export default function DisclosuresPage() {
  return (
    <div className="landing-v2 static-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">Disclosures</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />updated july 9, 2026</span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">transparency · affiliate disclosures</div>
            <h1 className="cj-page-h1">
              We will never rank cards by{" "}
              <em className="cj-section-accent">who pays us.</em>
            </h1>
            <p className="cj-page-lede">
              Every ranking, score, and recommendation on CreditOdds is decided by the
              data and the math behind it. An affiliate relationship with an issuer has
              never moved a card up or down, and it never will. This page explains, in
              plain language, exactly how we make money and where the lines are.
            </p>
            <div className="cj-page-meta">
              <span><b>Last updated</b> · July 9, 2026</span>
              <span><b>Applies to</b> · every page on CreditOdds</span>
            </div>
          </header>

          <div className="cj-pledge">
            <div className="cj-pledge-kicker">our promise</div>
            <ul className="cj-pledge-list">
              <li>
                <b>Money never changes the ranking.</b> Whether or not we earn a
                commission on a card has zero effect on where it lands in any list,
                score, or recommendation.
              </li>
              <li>
                <b>Money never changes what you see.</b> We will never hide or drop a
                card just because we don&apos;t have an affiliate deal with its issuer.
                If a card is the right answer, it shows up.
              </li>
              <li>
                <b>Some links pay us a kickback.</b> A few of the &quot;apply&quot;
                buttons on the site earn us a commission if you&apos;re approved. That
                revenue keeps CreditOdds free. It does not buy a better spot.
              </li>
            </ul>
          </div>

          <nav className="cj-toc-chips" aria-label="Sections">
            <a href="#ranking"><span>01</span>rankings are unpaid</a>
            <a href="#coverage"><span>02</span>full coverage</a>
            <a href="#affiliate-links"><span>03</span>affiliate links</a>
            <a href="#how-we-earn"><span>04</span>how we make money</a>
            <a href="#accuracy"><span>05</span>data &amp; accuracy</a>
            <a href="#ftc"><span>06</span>ftc &amp; advertiser notice</a>
            <a href="#contact"><span>07</span>questions</a>
          </nav>

          <section id="ranking" className="cj-static-section">
            <div className="cj-section-num">01 · rankings are unpaid</div>
            <h2>Affiliate relationships never affect our rankings.</h2>
            <div className="cj-callout">
              <b>In short:</b> the math decides the order, not the money.
            </div>
            <div className="cj-prose">
              <p>
                CreditOdds ranks and scores cards using objective inputs: signup bonus
                value, earning rates, annual fees, benefits, approval data, and how a
                card actually performs against the way you spend. Nothing about whether
                an issuer pays us a commission is fed into any of that.
              </p>
              <p>
                An issuer cannot pay for a higher rank, a better score, a &quot;top
                pick&quot; badge, or a more favorable write-up. There is no rate card, no
                pay-to-play tier, and no arrangement under which spending money with us
                moves a card up a list. If a card we earn nothing on beats a card we get
                paid on, the one we earn nothing on wins the spot. Every time.
              </p>
            </div>
          </section>

          <section id="coverage" className="cj-static-section">
            <div className="cj-section-num">02 · full coverage</div>
            <h2>We show cards whether or not we have an affiliate deal.</h2>
            <div className="cj-callout">
              <b>In short:</b> no affiliate relationship? The card still shows up.
            </div>
            <div className="cj-prose">
              <p>
                We will never leave a card out, or push it down, just because we
                don&apos;t have an affiliate relationship with the issuer. Our goal is to
                give you the complete, honest picture of the market, including cards that
                earn us nothing at all.
              </p>
              <p>
                If a card is the best answer to your question, it appears in the results
                on its own merits. When we can&apos;t send you to an affiliate
                application, we&apos;ll simply point you to the issuer&apos;s own site so
                you can apply directly.
              </p>
            </div>
          </section>

          <section id="affiliate-links" className="cj-static-section">
            <div className="cj-section-num">03 · affiliate links</div>
            <h2>Some links earn us a commission.</h2>
            <div className="cj-callout">
              <b>In short:</b> a few &quot;apply&quot; buttons pay us if you&apos;re
              approved. That&apos;s the only place money changes hands.
            </div>
            <div className="cj-prose">
              <p>
                Some of the links on CreditOdds are affiliate links. When you click one
                of these &quot;apply&quot; buttons and are approved for the card,
                CreditOdds may receive a commission from the issuer or an advertising
                partner. This comes at no cost to you, and it never changes the terms of
                the card you&apos;re applying for.
              </p>
              <p>
                Not every card links to an affiliate application. Where we have a
                relationship, the apply button routes through an advertising partner
                (for example, an affiliate network). Where we don&apos;t, the button
                sends you straight to the issuer. Either way, the ranking you saw before
                you clicked was decided the same way.
              </p>
            </div>
          </section>

          <section id="how-we-earn" className="cj-static-section">
            <div className="cj-section-num">04 · how we make money</div>
            <h2>How CreditOdds keeps the lights on.</h2>
            <div className="cj-prose">
              <p>
                CreditOdds is free to use. The affiliate commissions described above are
                the primary way we cover the cost of building and running the site:
                gathering card data, keeping it current, and building the tools that help
                you decide.
              </p>
              <p>
                We think this model only works if the incentive to be useful stays
                stronger than the incentive to be paid. That&apos;s why the wall between
                our editorial rankings and our revenue is absolute: the people and
                systems that decide how cards rank do not take money into account, full
                stop.
              </p>
            </div>
          </section>

          <section id="accuracy" className="cj-static-section">
            <div className="cj-section-num">05 · data &amp; accuracy</div>
            <h2>About the card details we publish.</h2>
            <div className="cj-callout cj-callout-warn">
              <b>Important:</b> always confirm the current terms on the issuer&apos;s
              page before you apply.
            </div>
            <div className="cj-prose">
              <p>
                We work hard to keep card details, bonuses, and rates accurate and up to
                date, but issuers change their offers frequently and without notice.
                CreditOdds is not the issuer of any card, and the terms you receive are
                set by the issuer, not by us.
              </p>
              <p>
                Reasonable efforts notwithstanding, the information on this site may not
                always reflect the most current offer. Card details should be verified on
                the issuer&apos;s own page before you apply, and CreditOdds does not
                provide financial, legal, or tax advice.
              </p>
            </div>
          </section>

          <section id="ftc" className="cj-static-section">
            <div className="cj-section-num">06 · ftc &amp; advertiser notice</div>
            <h2>Advertiser disclosure.</h2>
            <div className="cj-prose">
              <p>
                In keeping with U.S. Federal Trade Commission guidelines, we disclose
                that CreditOdds has advertising and affiliate relationships with some of
                the issuers and partners whose products appear on this site, and that we
                may be compensated when you are approved for a card through one of our
                links.
              </p>
              <p>
                This compensation may affect which affiliate links are available on a
                page, but, as stated throughout this document, it does not affect our
                editorial rankings, scores, or recommendations, and it does not determine
                whether a card is shown. Opinions expressed on CreditOdds are our own.
              </p>
            </div>
          </section>

          <section id="contact" className="cj-static-section">
            <div className="cj-section-num">07 · questions</div>
            <h2>Questions about this policy.</h2>
            <div className="cj-prose">
              <p>
                If anything here is unclear, or you want to know whether a specific link
                is an affiliate link, we&apos;re happy to tell you. Reach out any time
                through our <a href="/contact">contact page</a>.
              </p>
            </div>
          </section>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
