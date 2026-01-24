import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "CreditOdds Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="relative py-16 bg-white overflow-hidden">
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="text-lg max-w-prose mx-auto">
          <h1>
            <span className="block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase">
              LEGAL
            </span>
            <span className="mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Terms of Service
            </span>
          </h1>
        </div>
        <div className="mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto">
          <p>Last updated: January 2024</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using CreditOdds (&quot;the Service&quot;), you accept and agree to be
            bound by the terms and provisions of this agreement.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            CreditOdds provides user-submitted data about credit card approval odds for
            informational purposes only. We do not guarantee the accuracy of any information
            displayed on the site.
          </p>

          <h2>3. User Responsibilities</h2>
          <p>
            Users are responsible for providing accurate information when submitting data.
            Users must not submit false or misleading information.
          </p>

          <h2>4. No Financial Advice</h2>
          <p>
            CreditOdds does not provide financial advice. The information on this site
            should not be construed as financial advice. Please consult with a qualified
            financial advisor before making any financial decisions.
          </p>

          <h2>5. Privacy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. Please review
            our Privacy Policy to understand our practices.
          </p>

          <h2>6. Modifications to Service</h2>
          <p>
            CreditOdds reserves the right to modify or discontinue the Service at any time
            without notice.
          </p>

          <h2>7. Contact</h2>
          <p>
            If you have any questions about these Terms, please contact us at
            support@creditodds.com.
          </p>
        </div>
      </div>
    </div>
  );
}
