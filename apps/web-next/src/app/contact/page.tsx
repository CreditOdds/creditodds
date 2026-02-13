import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the CreditOdds team. Questions, feedback, or suggestions about credit card approval data? We'd love to hear from you.",
  openGraph: {
    title: "Contact CreditOdds",
    description: "Get in touch with questions or feedback",
  },
};

export default function ContactPage() {
  return (
    <div className="relative py-16 bg-white overflow-hidden">
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="text-lg max-w-prose mx-auto">
          <h1>
            <span className="block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase">
              CONTACT
            </span>
            <span className="mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Get in touch
            </span>
          </h1>
        </div>
        <div className="mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto">
          <p>
            Have questions, feedback, or suggestions? We&apos;d love to hear from you!
          </p>

          <h2>Twitter</h2>
          <p>
            Follow us on Twitter:{" "}
            <a href="https://twitter.com/MaxwellMelcher" target="_blank" rel="noreferrer">
              @MaxwellMelcher
            </a>
          </p>

          <h2>GitHub</h2>
          <p>
            Contribute to CreditOdds:{" "}
            <a href="https://github.com/CreditOdds/creditodds" target="_blank" rel="noreferrer">
              github.com/CreditOdds/creditodds
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
