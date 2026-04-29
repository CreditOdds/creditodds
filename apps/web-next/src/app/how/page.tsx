import { Metadata } from "next";
import Image from "next/image";
import { V2Footer } from "@/components/landing-v2/Chrome";
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
};

export default function HowPage() {
  return (
    <div className="landing-v2">
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
      <V2Footer />
    </div>
  );
}
