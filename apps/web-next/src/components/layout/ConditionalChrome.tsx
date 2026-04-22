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

function isV2FooterRoute(pathname: string): boolean {
  if (V2_FOOTER_ROUTES.has(pathname)) return true;
  return V2_FOOTER_PREFIXES.some((p) => pathname.startsWith(p));
}

export function ConditionalNavbar() {
  return <Navbar />;
}

export function ConditionalFooter() {
  const pathname = usePathname();
  if (isV2FooterRoute(pathname)) return null;
  return <Footer />;
}
