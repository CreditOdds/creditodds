import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about CreditOdds - the community-driven platform helping you understand your credit card approval chances before you apply. See real user data points to make informed decisions.",
  openGraph: {
    title: "About CreditOdds",
    description: "The community-driven platform for credit card approval data",
    url: "https://creditodds.com/about",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/about",
  },
};

export default function AboutPage() {
  return (
    <div className="landing-v2 static-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">about</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />est. 2021 · independent · founder-built</span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">about · the origin story</div>
            <h1 className="cj-page-h1">
              Can I get <em className="cj-section-accent">this card?</em>
            </h1>
            <p className="cj-page-lede">
              The question that started CreditOdds — and why the data behind it matters more
              than another sponsored listicle.
            </p>
            <div className="cj-page-meta">
              <span><b>Founded</b> · 2021</span>
              <span><b>Built by</b> · Max, founder</span>
              <span><b>Powered by</b> · real applicant data, not bank marketing</span>
            </div>
          </header>

          <section className="cj-static-section">
            <div className="cj-section-num">01 · the question</div>
            <h2>It started with a rejection.</h2>
            <div className="cj-prose">
              <p>
                My girlfriend asked me that while scrolling through her bank&apos;s credit
                card selection one evening. We&apos;d just finished going over an introduction
                to credit card rewards and she was eager to get her free flight to the
                Maldives.
              </p>
              <p>
                She gave me her credit score, which was decent, and I told her to apply. A
                few minutes later her application was complete and she hit submit.
                REJECTED. Gentlemen, guess who she was upset with? (Hint: It wasn&apos;t her
                bank.)
              </p>
            </div>
            <div className="cj-figure">
              <Image
                src="/assets/Graphic-01.svg"
                alt="CreditOdds — computer and credit card"
                width={1184}
                height={1376}
              />
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">02 · what banks won&apos;t tell you</div>
            <h2>The approval criteria aren&apos;t on the application page.</h2>
            <div className="cj-prose">
              <p>
                I&apos;ve been working in consumer banking for a little over 2 years and
                people always ask me to &ldquo;look into their situation.&rdquo; To be
                honest, I don&apos;t even know where I would start if I needed to find the
                person in charge of applications here. I work on the technology side and I
                do know that the approval process is almost completely automated. The
                bank&apos;s system takes everything you provide, pulls your credit history,
                and makes a decision based on select criteria. Unfortunately for everyone,
                these approval metrics aren&apos;t on the application page.
              </p>
              <blockquote>
                <p>
                  If a bank decides that nobody with a FICO credit score under 550 should be
                  approved for their card, they&apos;ll still let those people apply.
                </p>
              </blockquote>
              <p>
                While similar to college admissions, there are special cases — but the
                theory behind CreditOdds is that aggregate data will outline the bank&apos;s
                approval criteria for each card.
              </p>
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">03 · why it matters</div>
            <h2>Why it matters to my girlfriend and you.</h2>
            <div className="cj-prose">
              <p>
                My girlfriend was obviously upset that she didn&apos;t get the card, but she
                also knew from our earlier discussion that she had just received a
                &ldquo;hard pull&rdquo; on her credit. In short, when banks collect your
                credit history from a credit bureau that inquiry lowers your credit score.
                That&apos;s because these hard inquiries remain on your credit report for a
                few years and too many will make you appear as a high risk to lenders. It
                also means that immediately following a rejection isn&apos;t the best time
                to apply for another card.
              </p>
            </div>
            <div className="cj-callout">
              <b>The lesson:</b> a denial costs more than a missed sign-up bonus. It costs you a hard inquiry, a small score hit, and the next two or three months you might&apos;ve used to apply for something you actually qualify for.
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">04 · how the site works</div>
            <h2>One question, one community, one dataset.</h2>
            <div className="cj-prose">
              <p>
                Every approval-odds estimate on CreditOdds is built from records submitted
                by people who actually applied — credit score, income, outcome — not from
                bank marketing copy or estimated soft-pull APIs. The more people share
                their results, the sharper the picture gets for everyone reading next.
              </p>
            </div>
            <dl className="cj-deflist">
              <dt>Founder</dt>
              <dd>Max — built CreditOdds to answer the question I get asked at every family dinner. Background in consumer-banking technology.</dd>
              <dt>Independent</dt>
              <dd>Not owned by an issuer. Not part of an affiliate network. Rankings are not influenced by who pays a commission.</dd>
              <dt>Community-powered</dt>
              <dd>The dataset starts with applicants who took two minutes to share their result. Without you, the rest of the site doesn&apos;t work.</dd>
            </dl>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">05 · final note</div>
            <h2>This site only works with your help.</h2>
            <div className="cj-prose">
              <p>
                I&apos;m only scratching the surface in the world of credit cards. If
                you&apos;re interested in learning more please visit the{' '}
                <Link href="/how">How It Works</Link> page.
              </p>
              <p>
                Finally, this site only works with your help. I started this project by
                reading thousands of credit card forums to collect data points. If
                you&apos;ve found value in what you&apos;ve seen here please consider
                posting your results in the future.
              </p>
              <span className="cj-signature">Max · Founder</span>
            </div>
          </section>

          <div className="cj-cta-block">
            <div>
              <div className="cj-cta-eyebrow">help build the dataset</div>
              <h3 className="cj-cta-h">Share your result. Help the next applicant.</h3>
              <p className="cj-cta-sub">
                Two minutes, no card connection required. Your data point makes the next person&apos;s odds estimate sharper.
              </p>
            </div>
            <div className="cj-cta-actions">
              <Link href="/check-odds" className="cj-cta-btn">+ submit a result</Link>
              <Link href="/how" className="cj-cta-btn-outline">read the methodology</Link>
            </div>
          </div>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
