'use client';

// The legacy site-wide <Footer /> was retired (Apr 2026) — every page now
// renders <V2Footer /> directly (via its page or Client component, or via
// a route-group layout for `(auth)`). This file used to branch between
// that legacy footer and V2Footer with a route allowlist; that's gone.
// Kept as a thin wrapper around <Navbar /> so call sites in layout.tsx
// don't need to change.

import Navbar from './Navbar';

export function ConditionalNavbar() {
  return <Navbar />;
}
