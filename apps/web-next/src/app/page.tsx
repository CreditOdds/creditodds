import { Metadata } from "next";
import { getAllCards } from "@/lib/api";
import LandingClient from "./LandingClient";

export const metadata: Metadata = {
  title: "CreditOdds - See Your Credit Card Approval Odds",
  description: "Check your approval odds before applying for credit cards. Real data from thousands of applications showing credit scores, income levels, and approval rates.",
  openGraph: {
    title: "CreditOdds - See Your Credit Card Approval Odds",
    description: "Check your approval odds before applying for credit cards. Real data from thousands of applications.",
    url: "https://creditodds.com",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CreditOdds - See Your Credit Card Approval Odds",
    description: "Check your approval odds before applying for credit cards. Real data from thousands of applications.",
  },
  alternates: {
    canonical: "https://creditodds.com",
  },
};

export default async function LandingPage() {
  const cards = await getAllCards();

  return <LandingClient initialCards={cards} />;
}
