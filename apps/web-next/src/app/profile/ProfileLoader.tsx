'use client';

import { useEffect, useState } from 'react';

type Tone = 'accent' | 'csr' | 'amex' | 'bilt' | 'citi' | 'cap1';

function Card({ tone, klass }: { tone: Tone; klass: string }) {
  return (
    <div className={`pl-card t-${tone} ${klass}`}>
      <span className="pl-stripe short" />
      <span className="pl-stripe" />
    </div>
  );
}

function LoaderRiffle({ caption }: { caption: string }) {
  return (
    <div className="pl-host">
      <div className="pl-riffle" role="status" aria-label={caption}>
        <Card tone="accent" klass="r-l1" />
        <Card tone="csr" klass="r-r1" />
        <Card tone="amex" klass="r-l2" />
        <Card tone="bilt" klass="r-r2" />
        <Card tone="citi" klass="r-l3" />
        <Card tone="cap1" klass="r-r3" />
      </div>
      <p className="pl-caption">{caption}</p>
    </div>
  );
}

function LoaderDeal({ caption }: { caption: string }) {
  return (
    <div className="pl-host">
      <div className="pl-deal" role="status" aria-label={caption}>
        <Card tone="accent" klass="d-1" />
        <Card tone="csr" klass="d-2" />
        <Card tone="amex" klass="d-3" />
        <Card tone="bilt" klass="d-4" />
      </div>
      <p className="pl-caption">{caption}</p>
    </div>
  );
}

export default function ProfileLoader() {
  const [variant, setVariant] = useState<'riffle' | 'deal'>('riffle');
  useEffect(() => {
    setVariant(Math.random() < 0.5 ? 'riffle' : 'deal');
  }, []);
  return variant === 'riffle' ? (
    <LoaderRiffle caption="Shuffling your wallet" />
  ) : (
    <LoaderDeal caption="Loading your wallet" />
  );
}
