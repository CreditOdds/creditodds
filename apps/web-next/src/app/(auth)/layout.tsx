import type { Metadata } from "next";
import { V2Footer } from "@/components/landing-v2/Chrome";
import "../landing.css";

// The auth pages are utility screens with no search value. /login in particular
// is linked as /login?redirect=/card/<slug>?submit=true from every card page, so
// crawlers discovered one URL per card (~176) that all render identical HTML.
// Google filed the whole set under "Duplicate without user-selected canonical".
//
// noindex lives here rather than in login/page.tsx because that page is a client
// component, and client components can't export metadata.
//
// Deliberately NOT paired with a rel=canonical: noindex plus a canonical sends
// contradictory signals ("drop this" vs "consolidate this"). We want zero
// indexation of auth pages, so noindex alone is the decisive, unambiguous fix.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-v2 auth-v2">
      {children}
      <V2Footer />
    </div>
  );
}
