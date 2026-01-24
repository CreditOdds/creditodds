import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "CreditOdds Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="relative py-16 bg-white overflow-hidden">
      <div className="relative px-4 sm:px-6 lg:px-8">
        <div className="text-lg max-w-prose mx-auto">
          <h1>
            <span className="block text-base text-center text-indigo-600 font-semibold tracking-wide uppercase">
              LEGAL
            </span>
            <span className="mt-2 block text-3xl text-center leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Privacy Policy
            </span>
          </h1>
        </div>
        <div className="mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto">
          <p>Last updated: January 2024</p>

          <h2>Information We Collect</h2>
          <p>
            When you register for CreditOdds, we collect your email address and a display name.
            When you submit credit card application data, we collect the information you provide
            including credit score, income, and application results.
          </p>

          <h2>How We Use Your Information</h2>
          <p>
            We use the information you provide to display aggregated, anonymized credit card
            approval statistics to other users. Your personal information (email, display name)
            is never shared publicly.
          </p>

          <h2>Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information.
            Your data is stored securely using AWS infrastructure with encryption at rest and
            in transit.
          </p>

          <h2>Cookies</h2>
          <p>
            We use cookies to maintain your session when you log in. We do not use tracking
            cookies or share data with third-party advertisers.
          </p>

          <h2>Third Party Services</h2>
          <p>
            We use AWS Cognito for authentication. Please review Amazon&apos;s privacy policy for
            information about how they handle your data.
          </p>

          <h2>Your Rights</h2>
          <p>
            You may request deletion of your account and associated data at any time by
            contacting us at support@creditodds.com.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of any
            changes by posting the new policy on this page.
          </p>

          <h2>Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at
            support@creditodds.com.
          </p>
        </div>
      </div>
    </div>
  );
}
