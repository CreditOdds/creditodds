import { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the CreditOdds team. Questions, feedback, or suggestions about credit card approval data? We'd love to hear from you.",
  openGraph: {
    title: "Contact CreditOdds",
    description: "Get in touch with questions or feedback",
    url: "https://creditodds.com/contact",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <div className="eyebrow">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
            }}
          />
          <span>Contact · we&apos;re listening</span>
        </div>
        <h1 className="page-title">
          Get in <em>touch.</em>
        </h1>
        <p className="page-sub">
          Questions, feedback, or ideas for the site? CreditOdds is community-powered,
          so every message actually moves the roadmap.
        </p>
      </section>

      <div className="wrap">
        <article className="page-body">
          <h3>Twitter / X</h3>
          <p>
            Fastest way to reach me:{' '}
            <a href="https://twitter.com/MaxwellMelcher" target="_blank" rel="noreferrer">
              @MaxwellMelcher
            </a>
            .
          </p>

          <h3>GitHub</h3>
          <p>
            Contribute cards, news, articles, or fixes on GitHub:{' '}
            <a
              href="https://github.com/CreditOdds/creditodds"
              target="_blank"
              rel="noreferrer"
            >
              github.com/CreditOdds/creditodds
            </a>
            . Open an issue if you spot missing or wrong data — we&apos;ll jump on it.
          </p>

          <h3>Email</h3>
          <p>
            For anything longer-form,{' '}
            <a href="mailto:hello@creditodds.com">hello@creditodds.com</a>.
          </p>
        </article>
      </div>
      <V2Footer />
    </div>
  );
}
