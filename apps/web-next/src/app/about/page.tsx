import { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about CreditOdds - the community-driven platform helping you understand your credit card approval chances before you apply. See real user data points to make informed decisions.",
  openGraph: {
    title: "About CreditOdds",
    description: "The community-driven platform for credit card approval data",
  },
};

export default function AboutPage() {
  return (
    <div className="bg-white overflow-hidden">
      <div className="relative max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
        <div className="hidden lg:block bg-gray-50 absolute top-0 bottom-0 left-3/4 w-screen" />
        <div className="mx-auto text-base max-w-prose lg:grid lg:grid-cols-2 lg:gap-8 lg:max-w-none">
          <div>
            <h2 className="text-base text-indigo-600 font-semibold tracking-wide uppercase">
              About
            </h2>
            <h3 className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Can I get this card?
            </h3>
          </div>
        </div>
        <div className="mt-8 lg:grid lg:grid-cols-2 lg:gap-8">
          <div className="relative lg:row-start-1 lg:col-start-2">
            <svg
              className="hidden lg:block absolute top-0 right-0 -mt-20 -mr-20"
              width={404}
              height={384}
              fill="none"
              viewBox="0 0 404 384"
              aria-hidden="true"
            >
              <defs>
                <pattern
                  id="de316486-4a29-4312-bdfc-fbce2132a2c1"
                  x={0}
                  y={0}
                  width={20}
                  height={20}
                  patternUnits="userSpaceOnUse"
                >
                  <rect x={0} y={0} width={4} height={4} className="text-gray-200" fill="currentColor" />
                </pattern>
              </defs>
              <rect width={404} height={384} fill="url(#de316486-4a29-4312-bdfc-fbce2132a2c1)" />
            </svg>
            <div className="relative text-base mx-auto max-w-prose lg:max-w-none">
              <figure>
                <div className="aspect-w-12 aspect-h-7 lg:aspect-none">
                  <Image
                    className="rounded-lg shadow-lg object-cover object-center"
                    src="/assets/Graphic-01.svg"
                    alt="CreditOdds Computer and Credit Card"
                    width={1184}
                    height={1376}
                  />
                </div>
              </figure>
            </div>
          </div>
          <div className="mt-8 lg:mt-0">
            <div className="text-base max-w-prose mx-auto lg:max-w-none">
              <p className="text-gray-500">
                My girlfriend asked me that while scrolling through her bank&apos;s
                credit card selection one evening. We&apos;d just finished going
                over an introduction to credit card rewards and she was eager
                to get her free flight to the Maldives.
              </p>
            </div>
            <div className="mt-5 prose prose-indigo text-gray-500 mx-auto lg:max-w-none lg:row-start-1 lg:col-start-1">
              <p>
                She gave me her credit score, which was decent, and I told her
                to apply. A few minutes later her application was complete and
                she hit submit. REJECTED. Gentleman, guess who she was upset
                with? (Hint: It wasn&apos;t her bank)
              </p>
              <p>
                I&apos;ve been working in consumer banking for a little over 2
                years and people always ask me to &quot;look into their situation.&quot;
                To be honest, I don&apos;t even know where I would start if I
                needed to find the person in charge of applications here. I
                work on the technology side and I do know that the approval
                process is almost completely automated. The bank&apos;s system
                takes everything you provide, pulls your credit history, and
                makes a decision based on select criteria. Unfortunately for
                everyone, these approval metrics aren&apos;t on the application
                page.
              </p>
              <blockquote>
                <p>
                  As an example, if a bank decides that nobody with a FICO
                  credit score under 550 should be approved for their card
                  they&apos;ll still let those people apply.
                </p>
              </blockquote>
              <p>
                While similar to college admissions, there are special cases,
                the theory behind CreditOdds is that aggregate data will
                outline the bank&apos;s approval criteria for each card.
              </p>
              <h3>Why it matters to my girlfriend and you?</h3>
              <p>
                My girlfriend was obviously upset that she didn&apos;t get the
                card, but she also knew from our earlier discussion that she
                had just received a &quot;hard pull&quot; on her credit. In short, when
                banks collect your credit history from a credit bureau that
                inquiry lowers your credit score. That&apos;s because these hard
                inquiries remain on your credit report for a few years and too
                many will make you appear as a high risk to lenders. It also
                means that immediately following a rejection isn&apos;t the best
                time to apply for another card.
              </p>
              <h3>Final note</h3>
              <p>
                I&apos;m only scratching the surface in the worlds of credit cards.
                If you&apos;re interested in learning more please visit the How It
                Works / FAQ page.
              </p>
              <p>
                Finally, this site only works with your help. I started this
                project by reading thousands of credit card forums to collect
                data points. If you&apos;ve found value in what you&apos;ve seen here
                please consider posting your results in the future.
              </p>
              <p>Max (Founder)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
