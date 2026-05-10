import { Metadata } from "next";
import Link from "next/link";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";
import "../static-pages.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "CreditOdds Use of Private Information Policy",
  openGraph: {
    title: "Privacy Policy | CreditOdds",
    description: "CreditOdds Use of Private Information Policy",
    url: "https://creditodds.com/privacy",
    type: "website",
  },
  alternates: {
    canonical: "https://creditodds.com/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <div className="landing-v2 static-v2">
      <div className="cj-terminal">
        <nav className="cj-crumbs" aria-label="Breadcrumb">
          <span className="cj-crumb cj-crumb-current">privacy</span>
        </nav>
        <span className="cj-spacer" />
        <div className="cj-term-actions">
          <span><span className="cj-status-dot" />updated jan 27, 2026</span>
        </div>
      </div>

      <div className="cj-layout">
        <main className="cj-main-static">
          <header className="cj-page-head">
            <div className="cj-page-eyebrow">legal · privacy policy</div>
            <h1 className="cj-page-h1">
              Use of private <em className="cj-section-accent">information policy.</em>
            </h1>
            <p className="cj-page-lede">
              No complicated legal terms. No walls of unreadable text. Just what we collect,
              why, and how to reach us if something doesn&apos;t sit right.
            </p>
            <div className="cj-page-meta">
              <span><b>Last updated</b> · January 27, 2026</span>
              <span><b>Standard</b> · GDPR-aligned</span>
              <span><b>Trackers</b> · none beyond Google Analytics</span>
            </div>
          </header>

          <div className="cj-callout" style={{ marginTop: 18 }}>
            <b>The whole policy in one paragraph:</b> we collect what you tell us (your
            email, the data point you submit when you share an application result) and
            standard analytics. We use it to run the site and improve the dataset. We don&apos;t
            sell your information, we don&apos;t share it with anyone except where the law
            forces us to, and you can ask us to delete it any time.
          </div>

          <nav className="cj-toc-chips" aria-label="Sections">
            <a href="#summary"><span>01</span>summary</a>
            <a href="#why"><span>02</span>why we value privacy</a>
            <a href="#collect"><span>03</span>how we collect</a>
            <a href="#what"><span>04</span>what we hold</a>
            <a href="#where"><span>05</span>where we store it</a>
            <a href="#responsible"><span>06</span>who&apos;s responsible</a>
            <a href="#access"><span>07</span>who has access</a>
            <a href="#protect"><span>08</span>how we protect it</a>
            <a href="#complain"><span>09</span>how to complain</a>
            <a href="#changes"><span>10</span>changes</a>
          </nav>

          <section id="summary" className="cj-static-section">
            <div className="cj-section-num">01 · summary</div>
            <h2>Summary.</h2>
            <div className="cj-callout"><b>In short:</b> GDPR-aligned, plain English, no tricks.</div>
            <div className="cj-prose">
              <p>
                We respect the EU&apos;s General Data Protection Regulations (GDPR) and
                this policy explains how we collect and treat any information you give us.
                You won&apos;t find any complicated legal terms or long passages of
                unreadable text. We&apos;ve no desire to trick you into agreeing to
                something you might later regret.
              </p>
            </div>
          </section>

          <section id="why" className="cj-static-section">
            <div className="cj-section-num">02 · why we value your privacy</div>
            <h2>Why we value your privacy.</h2>
            <div className="cj-prose">
              <p>
                We value your privacy as much as we do our own, so we&apos;re committed to
                keeping your personal and business information safe. We&apos;re uncomfortable
                with the information companies, governments, and other organisations keep on
                file, so we ask for only the bare minimum from our customers. We&apos;ll
                never use your personal information for any reason other than why you gave
                it, and we&apos;ll never give anyone access to it unless we&apos;re forced
                to by law.
              </p>
            </div>
          </section>

          <section id="collect" className="cj-static-section">
            <div className="cj-section-num">03 · how we collect information</div>
            <h2>How we collect information.</h2>
            <div className="cj-callout"><b>In short:</b> Google Analytics for anonymous traffic patterns. No social-media trackers.</div>
            <div className="cj-prose">
              <p>
                We use Google Analytics to understand how visitors use our website. This
                helps us improve the site and user experience. Google Analytics collects
                anonymized data about page views and does not personally identify you. We
                don&apos;t use native social media &apos;like&apos; or &apos;sharing&apos;
                buttons which build profiles of your internet activity.
              </p>
            </div>
          </section>

          <section id="what" className="cj-static-section">
            <div className="cj-section-num">04 · what information we hold</div>
            <h2>What information we hold.</h2>
            <div className="cj-prose">
              <p>
                When you contact us by email or through our website, we collect your name,
                email address, if you&apos;ve given us that, and your IP address if you
                conduct a search (this allows us to block a denial of service attack).
              </p>
            </div>
            <dl className="cj-deflist">
              <dt>You give us</dt>
              <dd>Email and name when you create an account. The data points you submit when you report an application result — credit score, income, outcome.</dd>
              <dt>We collect automatically</dt>
              <dd>IP address (for abuse prevention), basic browser/device class, and anonymized analytics.</dd>
              <dt>What we do not collect</dt>
              <dd>We do not pull your credit. We do not connect to your bank. We do not run third-party advertising trackers.</dd>
            </dl>
          </section>

          <section id="where" className="cj-static-section">
            <div className="cj-section-num">05 · where we store your information</div>
            <h2>Where we store your information.</h2>
            <div className="cj-prose">
              <p>
                When you contact us by email or through our website, we store your
                information on our secure cloud database.
              </p>
            </div>
          </section>

          <section id="responsible" className="cj-static-section">
            <div className="cj-section-num">06 · who&apos;s responsible</div>
            <h2>Who&apos;s responsible for your information.</h2>
            <div className="cj-prose">
              <p>
                Our IT Department is responsible for the security of your information. You
                can contact them by using the <Link href="/contact">contact</Link> feature
                if you have any concerns about the information we store.
              </p>
            </div>
          </section>

          <section id="access" className="cj-static-section">
            <div className="cj-section-num">07 · who has access</div>
            <h2>Who has access to information about you.</h2>
            <div className="cj-callout"><b>In short:</b> only the people who actually need it to run the site.</div>
            <div className="cj-prose">
              <p>
                When we store information in our own systems, only the people who need it
                have access. Our management team has access to everything you&apos;ve
                provided.
              </p>
            </div>
          </section>

          <section id="protect" className="cj-static-section">
            <div className="cj-section-num">08 · how we protect it</div>
            <h2>The steps we take to keep your information private.</h2>
            <div className="cj-prose">
              <p>
                Where we store your information in third-party services, we restrict access
                only to people who need it.
              </p>
            </div>
          </section>

          <section id="complain" className="cj-static-section">
            <div className="cj-section-num">09 · how to complain</div>
            <h2>How to complain.</h2>
            <div className="cj-prose">
              <p>
                We take complaints very seriously. If you&apos;ve any reason to complain
                about the ways we handle your privacy, please contact us through the{' '}
                <Link href="/contact">contact</Link> feature.
              </p>
            </div>
          </section>

          <section id="changes" className="cj-static-section">
            <div className="cj-section-num">10 · changes to the policy</div>
            <h2>Changes to the policy.</h2>
            <div className="cj-prose">
              <p>
                If we change the contents of this policy, those changes will become
                effective the moment we publish them on our website.
              </p>
            </div>
          </section>
        </main>
      </div>

      <V2Footer />
    </div>
  );
}
