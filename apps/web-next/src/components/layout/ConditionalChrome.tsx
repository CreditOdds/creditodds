'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

const V2_FOOTER_ROUTES = new Set<string>([
  '/',
  '/news',
  '/explore',
  '/card-wire',
  '/best',
  '/profile',
  '/about',
  '/how',
  '/terms',
  '/privacy',
  '/check-odds',
  '/articles',
  '/compare',
  '/login',
  '/register',
  '/forgot',
  '/contact',
  '/admin',
  // /_admin is the underscore-prefixed entry that next.config.mjs rewrites
  // to /admin. The rewrite preserves the URL bar, so usePathname() returns
  // '/_admin' here even though the rendered page is admin/page.tsx
  // (which already renders its own V2Footer). Without this entry,
  // ConditionalFooter would also render the legacy <Footer /> and the
  // admin page would show two footers stacked.
  '/_admin',
  '/tools',
]);

const V2_FOOTER_PREFIXES = [
  '/card/',
  '/news/',
  '/best/',
  '/articles/',
  '/bank/',
  '/tools/',
];

function isV2FooterRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  // Strip a single trailing slash so '/admin/' matches '/admin'.
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname;
  if (V2_FOOTER_ROUTES.has(normalized)) return true;
  return V2_FOOTER_PREFIXES.some((p) => normalized.startsWith(p));
}

export function ConditionalNavbar() {
  return <Navbar />;
}

export function ConditionalFooter() {
  const pathname = usePathname();
  if (isV2FooterRoute(pathname)) return null;
  return <Footer />;
}
