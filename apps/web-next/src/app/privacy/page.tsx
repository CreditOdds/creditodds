import { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

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

const POLICY: { title: string; body: string }[] = [
  {
    title: 'Summary',
    body:
      "We respect the EU's General Data Protection Regulations (GDPR) and this policy explains how we collect and treat any information you give us. You won't find any complicated legal terms or long passages of unreadable text. We've no desire to trick you into agreeing to something you might later regret.",
  },
  {
    title: 'Why we value your privacy',
    body:
      "We value your privacy as much as we do our own, so we're committed to keeping your personal and business information safe. We're uncomfortable with the information companies, governments, and other organisations keep on file, so we ask for only the bare minimum from our customers. We'll never use your personal information for any reason other than why you gave it, and we'll never give anyone access to it unless we're forced to by law.",
  },
  {
    title: 'How we collect information',
    body:
      "We use Google Analytics to understand how visitors use our website. This helps us improve the site and user experience. Google Analytics collects anonymized data about page views and does not personally identify you. We don't use native social media 'like' or 'sharing' buttons which build profiles of your internet activity.",
  },
  {
    title: 'What information we hold',
    body:
      "When you contact us by email or through our website, we collect your name, email address, if you've given us that, and your IP address if you conduct a search (this allows us to block a denial of service attack).",
  },
  {
    title: 'Where we store your information',
    body:
      'When you contact us by email or through our website, we store your information on our secure cloud database.',
  },
  {
    title: "Who's responsible for your information",
    body:
      'Our IT Department is responsible for the security of your information. You can contact them by using the contact feature if you have any concerns about the information we store.',
  },
  {
    title: 'Who has access to information about you',
    body:
      "When we store information in our own systems, only the people who need it have access. Our management team has access to everything you've provided.",
  },
  {
    title: 'The steps we take to keep your information private',
    body:
      'Where we store your information in third-party services, we restrict access only to people who need it.',
  },
  {
    title: 'How to complain',
    body:
      "We take complaints very seriously. If you've any reason to complain about the ways we handle your privacy, please contact us through the contact feature.",
  },
  {
    title: 'Changes to the policy',
    body:
      'If we change the contents of this policy, those changes will become effective the moment we publish them on our website.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="landing-v2">
      <section className="page-hero wrap">
        <h1 className="page-title">
          Use of private <em>information policy.</em>
        </h1>
        <p className="page-sub">
          No complicated legal terms. No walls of unreadable text. Just what we collect,
          why, and how to reach us if something doesn&apos;t sit right.
        </p>
      </section>

      <div className="wrap">
        <article className="page-body wide">
          {POLICY.map((p) => (
            <div key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}

          <span className="stamp">
            <span className="dot" />
            Updated 1/27/26
          </span>
        </article>
      </div>
      <V2Footer />
    </div>
  );
}
