import { Metadata } from "next";
import Image from "next/image";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about CreditOdds - the community-driven platform helping you understand your credit card approval chances before you apply. See real user data points to make informed decisions.",
  openGraph: {
    title: "About CreditOdds",
    description: "The community-driven platform for credit card approval data",
    url: "https://creditodds.com/about",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <h1 className="page-title">
          Can I get <em>this card?</em>
        </h1>
        <p className="page-sub">
          The question that started CreditOdds — and why the data behind it matters more
          than another sponsored listicle.
        </p>
      </section>

      <div className="wrap">
        <article className="page-body">
          <figure>
            <Image
              src="/assets/Graphic-01.svg"
              alt="CreditOdds — computer and credit card"
              width={1184}
              height={1376}
            />
          </figure>
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

          <h3>Why it matters to my girlfriend and you</h3>
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

          <h3>Final note</h3>
          <p>
            I&apos;m only scratching the surface in the world of credit cards. If
            you&apos;re interested in learning more please visit the{' '}
            <a href="/how">How It Works</a> page.
          </p>
          <p>
            Finally, this site only works with your help. I started this project by
            reading thousands of credit card forums to collect data points. If
            you&apos;ve found value in what you&apos;ve seen here please consider
            posting your results in the future.
          </p>

          <p className="signature">Max · Founder</p>
        </article>
      </div>
      <V2Footer />
    </div>
  );
}
