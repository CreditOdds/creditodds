'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';
import Footer from './Footer';

const V2_FOOTER_ROUTES = new Set<string>(['/', '/news', '/explore']);

export function ConditionalNavbar() {
  return <Navbar />;
}

export function ConditionalFooter() {
  const pathname = usePathname();
  if (V2_FOOTER_ROUTES.has(pathname)) return null;
  return <Footer />;
}
