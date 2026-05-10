import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { FAQSchema } from "@/components/seo/JsonLd";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Discover how CreditOdds collects and analyzes credit card approval data. Submit your results and help others make informed decisions about credit card applications.",
  openGraph: {
    title: "How CreditOdds Works",
    description: "Our approach to credit card approval odds - powered by community data",
    url: "https://creditodds.com/how",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/how",
  },
};

interface FAQ {
  question: string;
  answer: string;
  source: { slug: string; title: string };
}

const FAQS: FAQ[] = [
  {
    question: "What is the Chase 5/24 rule?",
    answer:
      "If you've opened 5 or more personal credit cards (from any bank) in the past 24 months, Chase will automatically deny your application for most Chase cards — regardless of your credit score, income, or relationship with Chase. Most business cards from Chase, Amex, and Capital One don't count toward the 5/24 total because they don't report to personal credit bureaus.",
    source: { slug: "chase-5-24-rule-explained", title: "The Chase 5/24 Rule Explained" },
  },
  {
    question: "What's the perfect credit utilization percentage?",
    answer:
      "Between 1% and 9%, reported on at least one active card, with all other cards at $0 reported balances. This setup is sometimes called \"AZEO\" (All Zero Except One) and produces the highest FICO scores. The widely repeated \"keep it under 30%\" rule is the floor of acceptable, not the target.",
    source: { slug: "credit-utilization-explained", title: "Credit Utilization Explained" },
  },
  {
    question: "Does carrying a balance help my credit score?",
    answer:
      "No. This is one of the most damaging pieces of credit advice still in circulation. Credit bureaus don't track whether you paid in full or carried a balance — only whether you made the minimum payment on time. Carrying a balance just costs you interest and can keep your reported utilization higher. Pay the full statement balance every month.",
    source: { slug: "credit-utilization-explained", title: "Credit Utilization Explained" },
  },
  {
    question: "Does paying after my statement closes lower my reported utilization?",
    answer:
      "No. By the time you pay it off, the statement-closing balance has already been reported to the bureaus. To lower your reported utilization, you have to pay BEFORE the statement closes — typically 2–3 days early so the payment clears in time.",
    source: { slug: "credit-utilization-explained", title: "Credit Utilization Explained" },
  },
  {
    question: "How long after opening my first credit card will I have a FICO score?",
    answer:
      "Six months. The card needs to be open and reporting to the bureaus for at least 6 months before FICO will generate a score. VantageScore can score you sooner (sometimes after one month), but most lenders use FICO. First scores typically land in the 640–700 range with one well-managed account.",
    source: { slug: "how-long-to-build-credit", title: "How Long Does It Take to Build Credit?" },
  },
  {
    question: "How long does it take to recover from a missed payment?",
    answer:
      "About 12–18 months of consistent on-time payments to recover most of the score damage. The late stays on your report for 7 years, but its impact decays — a late from 5 years ago barely affects your score at all.",
    source: { slug: "how-long-to-build-credit", title: "How Long Does It Take to Build Credit?" },
  },
  {
    question: "Does becoming an authorized user actually help build credit?",
    answer:
      "Yes, if the primary cardholder has a long-held card with low utilization and on-time payments. Most issuers report authorized user activity to the bureaus the same way they report primary cardholder activity. Caveats: not all issuers report AU accounts to all three bureaus, and AU history can be discounted by some FICO models.",
    source: { slug: "how-long-to-build-credit", title: "How Long Does It Take to Build Credit?" },
  },
  {
    question: "How much should I deposit on a secured credit card?",
    answer:
      "Typically $300–$500 — enough to cover one or two months of recurring small purchases. Putting down more doesn't build credit faster and doesn't change the issuer's reporting behavior. The only reason to deposit more is if you genuinely need a larger usable limit.",
    source: { slug: "secured-credit-cards-explained", title: "Secured Credit Cards Explained" },
  },
  {
    question: "Will I get my secured card deposit back?",
    answer:
      "Yes, in two scenarios: (1) when the issuer graduates you to an unsecured card — your deposit is refunded as a statement credit or check, or (2) when you close the account in good standing with a $0 balance. Most users see a meaningful score improvement within 3–6 months and a substantial improvement after 12 months.",
    source: { slug: "secured-credit-cards-explained", title: "Secured Credit Cards Explained" },
  },
  {
    question: "Will applying for a balance transfer card hurt my credit score?",
    answer:
      "Yes, but mildly and usually temporarily. The hard inquiry typically costs 5–10 points, and opening a new account drops your average account age. However, your credit utilization ratio almost always improves once the transfer settles (because you've added a new credit limit), which often nets out positive after a few months.",
    source: { slug: "balance-transfer-cards-explained", title: "Balance Transfer Cards Explained" },
  },
  {
    question: "Can I transfer a balance between two cards from the same issuer?",
    answer:
      "No. Issuers do not let you transfer balances between their own cards. Balance transfers must come from a different bank — this is the main reason people end up with cards from multiple issuers.",
    source: { slug: "balance-transfer-cards-explained", title: "Balance Transfer Cards Explained" },
  },
  {
    question: "Should I close the old card after a balance transfer?",
    answer:
      "Usually no. Closing it reduces your total available credit and shortens your average account age, both of which can drop your score. Leave it open with a $0 balance unless it has an annual fee that isn't worth paying.",
    source: { slug: "balance-transfer-cards-explained", title: "Balance Transfer Cards Explained" },
  },
  {
    question: "Can you have multiple Citi Custom Cash cards to stack 5% categories?",
    answer:
      "Yes — Citi allows multiple Custom Cash cards (commonly up to 4–5 per person), and each tracks its 5% category independently. Two or three Custom Cash cards stacked correctly can earn $400–$700 a year in cash back versus a flat 2% card on the same spending.",
    source: { slug: "multiple-citi-custom-cash-cards", title: "Multiple Citi Custom Cash Cards Strategy" },
  },
  {
    question: "Do no-annual-fee cards have sign-up bonuses?",
    answer:
      "Yes. While bonuses on no-fee cards are typically smaller than premium cards, several offer ~$200 cash back welcome bonuses (Wells Fargo Active Cash, Chase Freedom Flex, Chase Freedom Unlimited) on modest first-3-month spend requirements.",
    source: { slug: "best-no-annual-fee-cashback-2026", title: "Best No-Annual-Fee Cash Back Cards in 2026" },
  },
];

export default function HowPage() {
  return (
    <div className="landing-v2 static-v2">
      <FAQSchema questions={FAQS.map((f) => ({ question: f.question, answer: f.answer }))} />

      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">how it works</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />methodology · public</span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">how it works · methodology</div>
            <h1 className="cj-page-h1">
              Our approach to <em className="cj-section-accent">credit card odds.</em>
            </h1>
            <p className="cj-page-lede">
              CreditOdds is a work in progress. The goal is to highlight the metrics
              required to get approved for any given card — sourced from real applications,
              not bank marketing copy.
            </p>
            <div className="cj-page-meta">
              <span><b>Approach</b> · community-submitted data</span>
              <span><b>Source</b> · real applicants, not soft-pull APIs</span>
              <span><b>Status</b> · always growing</span>
            </div>
          </header>

          <section className="cj-static-section">
            <div className="cj-section-num">01 · the loop</div>
            <h2>Three steps. That&apos;s the whole product.</h2>
            <div className="cj-steps">
              <div className="cj-step">
                <div className="cj-step-num">1</div>
                <div className="cj-step-h">You apply.</div>
                <p className="cj-step-p">Approved or denied — either outcome is a useful data point for the next applicant.</p>
              </div>
              <div className="cj-step">
                <div className="cj-step-num">2</div>
                <div className="cj-step-h">You share the result.</div>
                <p className="cj-step-p">Score, income, outcome. Two minutes. Anonymous in aggregate.</p>
              </div>
              <div className="cj-step">
                <div className="cj-step-num">3</div>
                <div className="cj-step-h">We do the math.</div>
                <p className="cj-step-p">Aggregated across thousands of submissions to surface real approval patterns per card.</p>
              </div>
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">02 · the source</div>
            <h2>Where the data comes from.</h2>
            <div className="cj-prose">
              <p>
                Initially, I sourced this data from Reddit (shout out{' '}
                <a
                  href="https://reddit.com/r/CreditCards"
                  target="_blank"
                  rel="noreferrer"
                >
                  /r/CreditCards
                </a>
                ) and other credit card forums. This approach isn&apos;t scalable and I am
                hoping that this site provides a medium for collecting this information at
                scale. While I have a backlog of features I&apos;d like to achieve, this
                early version of CreditOdds <strong>will rely heavily on the good will of
                you</strong> to report your results to help others.
              </p>
            </div>
            <div className="cj-callout">
              <b>What this is not:</b> a soft-pull credit check. It&apos;s a population estimate based on what other applicants with similar profiles experienced. Your actual outcome depends on signals we don&apos;t see — relationship history, recent inquiries, internal issuer flags.
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">03 · the data points</div>
            <h2>What we ask for when you submit a result.</h2>
            <div className="cj-prose">
              <p>
                When a user signs up they have the ability to report a result on any card.
                We ask for a few pieces of important information when submitting a result:
              </p>
            </div>
            <dl className="cj-deflist">
              <dt>Required</dt>
              <dd>Credit score, income, application date, age of oldest account (length of credit), existing account with bank, approved or denied.</dd>
              <dt>If approved</dt>
              <dd>Starting credit limit.</dd>
              <dt>If rejected</dt>
              <dd>The reason the bank provided.</dd>
            </dl>
            <div className="cj-prose">
              <p>
                There are many other questions I&apos;d like to ask, but this is the
                baseline that I feel people will answer. I selected these fields because
                it&apos;s what you&apos;ll likely see on most card applications. Your credit
                score also gives a good high-level analysis of what the bank sees when they
                pull your credit.
              </p>
            </div>
            <div className="cj-figure">
              <Image
                src="/assets/Graphic-03.svg"
                alt="How the data flows"
                width={660}
                height={438}
              />
            </div>
            <div className="cj-prose">
              <p>
                This is by no means an exact science. As mentioned before, there are
                special exceptions that aren&apos;t currently accounted for in the reporting
                template. If you have questions, comments, or concerns, start a discussion
                on{' '}
                <a href="https://twitter.com/MaxwellMelcher" target="_blank" rel="noreferrer">
                  Twitter / X
                </a>
                .
              </p>
            </div>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">04 · what we don&apos;t do</div>
            <h2>And the lines we don&apos;t cross.</h2>
            <ul className="cj-dontlist">
              <li>
                <span className="cj-x">×</span>
                <span>We don&apos;t pull your credit. No soft inquiries, no hard inquiries, no bureau access of any kind.</span>
              </li>
              <li>
                <span className="cj-x">×</span>
                <span>We don&apos;t connect to your bank. Anything we know about your wallet is what you tell us.</span>
              </li>
              <li>
                <span className="cj-x">×</span>
                <span>We don&apos;t change rankings for affiliate payout. Affiliate links exist; the order of cards on a page is not influenced by them.</span>
              </li>
              <li>
                <span className="cj-x">×</span>
                <span>We don&apos;t sell individual records, individual user data, or anything tied to your account. See <Link href="/privacy">/privacy</Link> for the long version.</span>
              </li>
            </ul>
          </section>

          <section className="cj-static-section">
            <div className="cj-section-num">05 · faq</div>
            <h2>Common questions.</h2>
            <div className="cj-prose">
              <p>
                Quick answers pulled from our long-form{' '}
                <Link href="/articles">articles</Link>. Tap a question for the short version, then follow the link for the full breakdown.
              </p>
            </div>
            <div className="cj-faq">
              {FAQS.map((faq) => (
                <details key={faq.question}>
                  <summary>
                    <span>{faq.question}</span>
                    <span className="cj-faq-marker" aria-hidden="true">+</span>
                  </summary>
                  <div className="cj-faq-body">
                    <p>{faq.answer}</p>
                    <Link href={`/articles/${faq.source.slug}`}>
                      Read: {faq.source.title} →
                    </Link>
                  </div>
                </details>
              ))}
            </div>
            <div className="cj-prose" style={{ marginTop: 18 }}>
              <p>
                Have a question that should be here?{' '}
                <Link href="/contact">Send it our way</Link>.
              </p>
            </div>
          </section>

          <div className="cj-cta-block">
            <div>
              <div className="cj-cta-eyebrow">help build the dataset</div>
              <h3 className="cj-cta-h">Submit your result. Sharpen the next person&apos;s odds.</h3>
              <p className="cj-cta-sub">
                Two minutes. No card connection, no credit pull. The dataset only works because people share.
              </p>
            </div>
            <div className="cj-cta-actions">
              <Link href="/check-odds" className="cj-cta-btn">+ submit a result</Link>
              <Link href="/about" className="cj-cta-btn-outline">about creditodds</Link>
            </div>
          </div>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
