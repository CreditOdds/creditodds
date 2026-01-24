import { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Discover how CreditOdds collects and analyzes credit card approval data. Submit your results and help others make informed decisions about credit card applications.",
  openGraph: {
    title: "How CreditOdds Works",
    description: "Our approach to credit card approval odds - powered by community data",
  },
};

export default function HowPage() {
  return (
    <div className="relative py-16 bg-white overflow-hidden">
      <div className="hidden lg:block lg:absolute lg:inset-y-0 lg:h-full lg:w-full">
        <div className="relative h-full text-lg max-w-prose mx-auto" aria-hidden="true">
          <svg
            className="absolute top-12 left-full transform translate-x-32"
            width={404}
            height={384}
            fill="none"
            viewBox="0 0 404 384"
          >
            <defs>
              <pattern id="pattern1" x={0} y={0} width={20} height={20} patternUnits="userSpaceOnUse">
                <rect x={0} y={0} width={4} height={4} className="text-gray-200" fill="currentColor" />
              </pattern>
            </defs>
            <rect width={404} height={384} fill="url(#pattern1)" />
          </svg>
        </div>
      </div>
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="text-lg max-w-prose mx-auto">
          <h1>
            <span className="block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase">
              HOW
            </span>
            <span className="mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Our approach to credit card odds
            </span>
          </h1>
          <p className="mt-8 text-xl text-gray-500 leading-8">
            CreditOdds is very much a work in progress. The goal of this site is to
            highlight the metrics required to get approved for any given credit card.
            Initially, I sourced this data from reddit (shout out /r/CreditCards) and
            other credit card forums. This approach isn&apos;t scalable and I am hoping
            that this site provides a medium for collecting this information at scale.
            While I have a backlog of features I&apos;d like to achieve, this early version
            of CreditOdds <strong>will rely heavily on the good will of you</strong> to
            report your results to help others.
          </p>
        </div>
        <div className="mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto">
          <p>
            When a user signs up they have the ability to report a result on any card.
            We ask for a few pieces of important information when submitting a result:
          </p>
          <ul>
            <li>Credit Score</li>
            <li>Income</li>
            <li>Application Date</li>
            <li>Age of Oldest Account (Length of Credit)</li>
            <li>Existing Account with Bank</li>
            <li>Approved?</li>
          </ul>
          <p>If approved:</p>
          <ul>
            <li>Starting Credit Limit</li>
          </ul>
          <p>If rejected:</p>
          <ul>
            <li>Reason provided</li>
          </ul>
          <p>
            There are many other questions I&apos;d like to ask, but this is the baseline
            that I feel people will answer. I selected these fields because it is what
            you will likely see on most card applications. Additionally your credit
            score gives a good high level analysis of what the bank sees when they pull
            your credit.
          </p>
          <figure>
            <Image
              className="w-full rounded-lg"
              src="/assets/Graphic-03.svg"
              alt=""
              width={660}
              height={438}
            />
          </figure>
          <p>
            This is by no means an exact science. As I&apos;ve mentioned before, there are
            special exceptions which I don&apos;t currently account for in my reporting
            template. If you have questions, comments, or concerns I invite you to start
            a discussion with me on{" "}
            <a href="https://twitter.com/MaxwellMelcher" target="_blank" rel="noreferrer">
              twitter
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
