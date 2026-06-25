'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/lib/api';
import { BestPageCard, BestPanel } from '@/lib/best';
import { BestComparisonTable } from './BestComparisonTable';
import { BestCardList } from './BestCardList';
import { ModelIcon } from './ModelIcon';

type EnrichedCard = BestPageCard & { card: Card };

interface BestRankingViewsProps {
  cards: EnrichedCard[];
  panel?: BestPanel;
}

const CONSENSUS = 'consensus';

export function BestRankingViews({ cards, panel }: BestRankingViewsProps) {
  const models = panel?.models ?? [];
  // Only offer per-model views when we have a real panel (2+ models) and the
  // cards actually carry per-model ranks.
  const hasPanel =
    models.length >= 2 && cards.some(c => c.consensus?.ranks && Object.keys(c.consensus.ranks).length > 0);

  const [view, setView] = useState<string>(CONSENSUS);

  const ordered = useMemo(() => {
    if (view === CONSENSUS || !hasPanel) return cards;
    return [...cards].sort((a, b) => {
      const ra = a.consensus?.ranks?.[view] ?? Number.MAX_SAFE_INTEGER;
      const rb = b.consensus?.ranks?.[view] ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, [view, cards, hasPanel]);

  return (
    <>
      {hasPanel && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 13,
              color: 'var(--muted)',
            }}
          >
            <span style={{ fontWeight: 600 }}>View ranking by:</span>
            <div
              role="tablist"
              aria-label="Ranking view"
              style={{
                display: 'inline-flex',
                gap: 4,
                padding: 4,
                borderRadius: 10,
                background: 'color-mix(in oklab, var(--accent) 6%, transparent)',
                border: '1px solid var(--line, rgba(0,0,0,0.08))',
                flexWrap: 'wrap',
              }}
            >
              <ViewButton label="Consensus" active={view === CONSENSUS} onClick={() => setView(CONSENSUS)} />
              {models.map(m => (
                <ViewButton
                  key={m.key}
                  label={m.label}
                  icon={<ModelIcon modelKey={m.key} />}
                  active={view === m.key}
                  onClick={() => setView(m.key)}
                />
              ))}
            </div>
          </div>
          <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
            {view === CONSENSUS
              ? `Consensus ranking, combined ${panel?.method === 'borda' ? 'Borda-count ' : ''}vote of ${models.length} models.`
              : `Showing ${models.find(m => m.key === view)?.label ?? 'this model'}'s individual ranking.`}
          </p>
        </div>
      )}

      <BestComparisonTable cards={ordered} />
      <BestCardList cards={ordered} panel={panel} activeView={hasPanel ? view : undefined} />
    </>
  );
}

function ViewButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 7,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--ink, #1a1a2e)',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
