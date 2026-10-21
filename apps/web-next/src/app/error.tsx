'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">This page is temporarily unavailable</h1>
      <p className="mt-4 text-gray-600">We couldn&apos;t load the page. Please try again in a moment.</p>
      <button type="button" disabled={pending} className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 text-white disabled:opacity-50"
        onClick={() => startTransition(() => { router.refresh(); reset(); })}>
        {pending ? 'Retrying…' : 'Try again'}
      </button>
    </main>
  );
}
