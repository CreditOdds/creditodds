import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { V2Footer } from "@/components/landing-v2/Chrome";
import { FAQSchema } from "@/components/seo/JsonLd";
import "../landing.css";

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
    <div className="landing-v2">
      <FAQSchema questions={FAQS.map((f) => ({ question: f.question, answer: f.answer }))} />

      <section className="page-hero wrap">
        <h1 className="page-title">
          Our approach to <em>credit card odds.</em>
        </h1>
        <p className="page-sub">
          CreditOdds is a work in progress. The goal is to highlight the metrics
          required to get approved for any given card — sourced from real applications,
          not bank marketing copy.
        </p>
      </section>

      <div className="wrap">
        <article className="page-body">
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

          <h3>The data points we collect</h3>
          <p>
            When a user signs up they have the ability to report a result on any card.
            We ask for a few pieces of important information when submitting a result:
          </p>
          <ul>
            <li>Credit score</li>
            <li>Income</li>
            <li>Application date</li>
            <li>Age of oldest account (length of credit)</li>
            <li>Existing account with bank</li>
            <li>Approved?</li>
          </ul>
          <p>If approved:</p>
          <ul>
            <li>Starting credit limit</li>
          </ul>
          <p>If rejected:</p>
          <ul>
            <li>Reason provided</li>
          </ul>
          <p>
            There are many other questions I&apos;d like to ask, but this is the
            baseline that I feel people will answer. I selected these fields because
            it&apos;s what you&apos;ll likely see on most card applications. Your credit
            score also gives a good high-level analysis of what the bank sees when they
            pull your credit.
          </p>

          <figure>
            <Image
              src="/assets/Graphic-03.svg"
              alt="How the data flows"
              width={660}
              height={438}
            />
          </figure>

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
        </article>
      </div>

      <section className="wrap" style={{ paddingTop: 8, paddingBottom: 64 }}>
        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
          }}
        >
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: 'var(--accent)',
                marginBottom: 10,
              }}
            >
              Common Questions
            </div>
            <h2
              style={{
                fontFamily: "'Inter Tight', sans-serif",
                fontSize: 'clamp(28px, 4vw, 38px)',
                fontWeight: 700,
                letterSpacing: -0.5,
                margin: '0 0 12px',
                color: 'var(--ink)',
              }}
            >
              Credit card FAQ.
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: 'var(--muted)',
                margin: 0,
              }}
            >
              Quick answers pulled from our long-form{' '}
              <Link href="/articles" style={{ color: 'var(--accent)', borderBottom: '1px solid currentColor', textDecoration: 'none' }}>
                articles
              </Link>
              . Tap a question for the short version, then follow the link for the
              full breakdown.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                style={{
                  background: 'var(--bg-2, #fff)',
                  border: '1px solid var(--line-2, #e5e7eb)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    listStyle: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    lineHeight: 1.4,
                  }}
                >
                  <span>{faq.question}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      color: 'var(--muted)',
                      fontSize: 20,
                      lineHeight: 1,
                      marginTop: 2,
                    }}
                  >
                    +
                  </span>
                </summary>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: 'var(--ink-2, #374151)',
                  }}
                >
                  <p style={{ margin: '0 0 10px' }}>{faq.answer}</p>
                  <Link
                    href={`/articles/${faq.source.slug}`}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      borderBottom: '1px solid currentColor',
                    }}
                  >
                    Read: {faq.source.title} →
                  </Link>
                </div>
              </details>
            ))}
          </div>

          <p
            style={{
              marginTop: 28,
              fontSize: 14,
              color: 'var(--muted)',
              textAlign: 'center',
            }}
          >
            Have a question that should be here?{' '}
            <Link href="/contact" style={{ color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid currentColor' }}>
              Send it our way
            </Link>
            .
          </p>
        </div>
      </section>

      <V2Footer />
    </div>
  );
}
